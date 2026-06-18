# Proposal 6: Feature Flags in AWS Lambda

## The problem

Lambda is stateless and short-lived. There is no persistent Datadog Agent process, no long-lived connection to a flag management service, and cold starts add initialization cost to every new container. The standard server-side flag setup needs to be adapted for these constraints.

## Architecture diagram

```
  LAMBDA EXECUTION ENVIRONMENT
  ──────────────────────────────────────────────────────────────────

  ┌─────────────────────────────────────────────────────────────────┐
  │                    Lambda Container                              │
  │                                                                 │
  │   ┌─────────────────────────────────────────────────────────┐  │
  │   │                  Your Handler                            │  │
  │   │                                                         │  │
  │   │   import './tracer'  ← module-level, runs once          │  │
  │   │                        per cold start                   │  │
  │   │                                                         │  │
  │   │   const client = OpenFeature.getClient()  ← cached      │  │
  │   │                                                         │  │
  │   │   export const handler = async (event) => {             │  │
  │   │     const variant = await client.getStringValue(        │  │
  │   │       'my_flag',                                        │  │
  │   │       'control',                                        │  │
  │   │       { targetingKey: event.userId }                    │  │
  │   │     )                                                   │  │
  │   │   }                                                     │  │
  │   └─────────────────────────────────────────────────────────┘  │
  │                                                                 │
  │   ┌─────────────────────────────────────────────────────────┐  │
  │   │           Datadog Lambda Extension (layer)               │  │
  │   │                                                         │  │
  │   │   - Fetches flag configs from Remote Configuration      │  │
  │   │   - Caches configs across warm invocations              │  │
  │   │   - Ships traces, metrics, logs to Datadog              │  │
  │   │   - Runs as a separate process alongside your code      │  │
  │   └─────────────────────────────────────────────────────────┘  │
  │                                                                 │
  └───────────────────────┬─────────────────────────────────────────┘
                          │
           ┌──────────────┴───────────────┐
           │                              │
           ▼                              ▼
  ┌─────────────────┐          ┌─────────────────────────┐
  │    Datadog      │          │   Datadog Remote Config  │
  │  APM / Metrics  │          │                         │
  │  Logs / RUM     │          │  flag rules pushed to   │
  │                 │          │  Extension, cached       │
  │  traces tagged  │          │  until TTL expires       │
  │  with variant   │          │  (~60 seconds)           │
  └─────────────────┘          └─────────────────────────┘

  COLD START vs WARM INVOCATION
  ──────────────────────────────────────────────────────────────────

  Cold start (new container)
  ┌──────────────────────────────────────────────────────────────┐
  │  Container init                                              │
  │  ├── tracer.init()          ~50-100ms  ◄── pays cost once   │
  │  ├── OpenFeature.setProvider()                              │
  │  ├── Extension starts, fetches flag configs from Remote     │
  │  │   Config                            ~100-200ms           │
  │  └── handler executes                                       │
  └──────────────────────────────────────────────────────────────┘

  Warm invocation (same container reused)
  ┌──────────────────────────────────────────────────────────────┐
  │  handler executes immediately                                │
  │  ├── client (cached) reads flag from Extension cache        │
  │  └── no re-initialization                   ~0ms overhead   │
  └──────────────────────────────────────────────────────────────┘

  ANONYMOUS / UNAUTHENTICATED REQUESTS
  ──────────────────────────────────────────────────────────────────

  ┌───────────────┐      ┌──────────────┐      ┌────────────────┐
  │  API Request  │      │    Lambda    │      │   Datadog      │
  │               │      │              │      │                │
  │  no user ID  ─┼─────►│  targetingKey│      │  all anonymous │
  │  (pre-login)  │      │  = session ID│─────►│  traffic gets  │
  │               │      │  or request  │      │  same stable   │
  │               │      │  correlation │      │  key, not      │
  │               │      │  ID (stable) │      │  random UUID   │
  └───────────────┘      └──────────────┘      └────────────────┘

  LAMBDA LAYERS SETUP
  ──────────────────────────────────────────────────────────────────

  ┌──────────────────────────────────────────────────────────────┐
  │  Your Lambda Function                                        │
  │                                                              │
  │  Layers:                                                     │
  │  ├── Datadog-Node20-x  (dd-trace + OpenFeature server SDK)  │
  │  └── Datadog-Extension (agent + Remote Config)              │
  │                                                              │
  │  Environment:                                                │
  │  ├── DD_API_KEY                                             │
  │  ├── DD_SITE                                                │
  │  ├── DD_ENV                                                 │
  │  ├── DD_SERVICE                                             │
  │  └── DD_LAMBDA_HANDLER  (if using Datadog handler wrapper)  │
  └──────────────────────────────────────────────────────────────┘
```

## What changes from a regular Node.js service

| Concern | Regular service | Lambda |
|---|---|---|
| Datadog Agent | Runs as a sidecar process | Lambda Extension layer |
| Remote Configuration | Agent fetches flag configs | Extension fetches and caches |
| Tracer init | Once at process start | Once per cold start (module level) |
| Flag config propagation | Continuous | Cached by Extension, TTL ~60s |
| Persistent connections | Yes | No -- reconnects per cold start |

## Setup

Add two Lambda layers in your infrastructure config (CDK, SAM, Terraform, or console):

- `Datadog-Node20-x` -- includes dd-trace and the OpenFeature server SDK
- `Datadog-Extension` -- the Lambda Extension that handles Remote Config and ships telemetry

```ts
// tracer.ts -- must be the very first import
import tracer from 'dd-trace';
import { OpenFeature } from '@openfeature/server-sdk';

tracer.init({
  service: process.env.DD_SERVICE ?? 'my-lambda',
  env: process.env.DD_ENV ?? 'production',
  experimental: { flaggingProvider: { enabled: true } },
});

OpenFeature.setProvider(tracer.openfeature);
```

```ts
// handler.ts
import './tracer'; // first import, always
import { OpenFeature } from '@openfeature/server-sdk';

const client = OpenFeature.getClient(); // cached at module level

export const handler = async (event: any) => {
  const userId = event.requestContext?.authorizer?.userId;

  const variant = await client.getStringValue(
    'my_feature_flag',
    'control',
    { targetingKey: userId ?? event.requestContext?.requestId }
  );

  // use variant
};
```

## The targeting key problem for anonymous requests

If no user ID is available (pre-login flows), do not use `Math.random()` or a timestamp as the targeting key. Every invocation would get a different variant, making the experiment unmeasurable.

Use a stable identifier instead:
- API Gateway request correlation ID (consistent within a session if you pass it through)
- A session cookie value passed in the event headers
- A device ID from the mobile client

If none of these are available, fall back to the default value and do not count the invocation as an experiment exposure.

## Remote Configuration requirement

Remote Configuration is required for server-side flag evaluation. The Lambda Extension must have it enabled, and your API key needs the Remote Configuration Read permission. Without it, the Extension cannot receive flag rules from Datadog and every evaluation returns the default value.

Flag config updates propagate to running Lambda containers within the Extension's cache TTL (approximately 60 seconds). Containers that have been idle and recycled by AWS will pick up the latest config on their next cold start.

## Provisioned Concurrency

If the Lambda uses Provisioned Concurrency, the container is initialized before any requests arrive. The tracer and OpenFeature provider initialize at provisioning time, and the Extension fetches flag configs during that window. Warm invocations pay zero initialization cost and start with flag configs already loaded.

This makes Provisioned Concurrency the recommended configuration for experiment-critical Lambda functions where cold start latency would affect experiment results.
