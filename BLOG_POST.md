# How to Run Your First A/B Test Without Breaking Production

You shipped a UI change to 100% of your users. Conversion dropped 12%. You rolled it back three hours later — but by then, thousands of sessions had already hit the broken experience.

This is not a hypothetical. It happens to teams of every size, and it usually happens for the same reason: the change was deployed and exposed to users at the same time. There was no middle ground between "off" and "everyone."

Feature flags fix this. They decouple deployment from release, letting you ship code to production and expose it to users gradually — 1%, 10%, 50% — with a kill switch at every step.

In this post, I'll walk through building a real A/B test for a checkout button using two approaches: **Datadog Native Feature Flags** and **Statsig + Datadog RUM**. You'll see how each one works, when to use which, and how to wire up error tracking so you can catch problems before they affect your whole user base.

The full sandbox is on GitHub if you want to follow along.

---

## The experiment: checkout button copy and color

We're testing two variants of a checkout button:

- **Control** — "Buy Now" (blue)
- **Variant** — "Complete Purchase" (green)

Simple enough to build in an afternoon. Complex enough to show every layer of the stack: flag evaluation, RUM correlation, session replay, error tracking, and rollback.

---

## Two architectures, one goal

Before writing any code, it's worth understanding the difference between the two approaches — because they're not interchangeable.

### Approach A: Datadog Native Feature Flags

Datadog's own feature flag product evaluates flags client-side using rules you define in the Datadog UI. The SDK is built on [OpenFeature](https://openfeature.dev/), an open standard, which means you're not locked into Datadog-specific APIs.

The key benefit: flag evaluations are **natively correlated** with RUM sessions, errors, and session replays — no extra instrumentation needed. When an error occurs, you can see exactly which flag variant that user was in.

### Approach B: Statsig + Datadog RUM

Statsig is a dedicated experimentation platform with a more mature statistical engine. You evaluate flags in Statsig, then push the result into Datadog RUM with a single line:

```ts
datadogRum.addFeatureFlagEvaluation(flagName, value);
```

This bridge makes Datadog RUM aware of the Statsig evaluation, so you get the same session-level correlation as Approach A — just with Statsig as the flag engine.

### When to use which

| | Datadog Native | Statsig + Datadog RUM |
|---|---|---|
| Flag management | Datadog UI | Statsig console |
| Experimentation stats | Datadog | Statsig (more mature) |
| Observability | Native — automatic | Via `addFeatureFlagEvaluation()` bridge |
| Rollback trigger | Datadog monitor → circuit breaker | Datadog monitor → kills Statsig gate |
| Best for | Teams all-in on Datadog | Teams wanting dedicated experimentation |

---

## Building the browser-side experiment

### Setup

```bash
npm create vite@latest ab-test-sandbox -- --template react-ts
cd ab-test-sandbox
npm install @datadog/openfeature-browser @openfeature/react-sdk @openfeature/web-sdk @openfeature/core
```

### Initialize the provider

The `DatadogProvider` handles both RUM initialization and flag evaluation. Wire it up at the top of your app, before anything renders:

```ts
// main.tsx
import { OpenFeature } from '@openfeature/web-sdk';
import { OpenFeatureProvider } from '@openfeature/react-sdk';
import { DatadogProvider } from '@datadog/openfeature-browser';

const provider = new DatadogProvider({
  applicationId: 'your-application-id',
  clientToken: 'your-client-token',
  site: 'datadoghq.com',
  env: 'production',
});

OpenFeature.setProvider(provider, {
  targetingKey: currentUser.id, // determines which bucket the user falls into
});

root.render(
  <OpenFeatureProvider>
    <App />
  </OpenFeatureProvider>
);
```

The `targetingKey` is how Datadog assigns users to variants. Same key always gets the same variant — consistent experience across sessions.

### Evaluate the flag in a component

```ts
import { useStringFlagDetails } from '@openfeature/react-sdk';

function useCheckoutVariant() {
  const details = useStringFlagDetails('checkout_button_variant', 'control');
  return details.value === 'variant' ? 'variant' : 'control';
}
```

That's it. The `DatadogProvider` automatically calls `datadogRum.addFeatureFlagEvaluation()` on every evaluation — your RUM sessions are tagged with the flag result without any extra code.

### The checkout button

```tsx
const variants = {
  control: { label: 'Buy Now', color: '#1a73e8' },
  variant: { label: 'Complete Purchase', color: '#2e7d32' },
};

function CheckoutButton({ variant }: { variant: 'control' | 'variant' }) {
  const { label, color } = variants[variant];

  function handleClick() {
    datadogRum.addAction('checkout_clicked', { variant });
  }

  return (
    <button style={{ backgroundColor: color }} onClick={handleClick}>
      {label}
    </button>
  );
}
```

Every click fires a RUM action tagged with the variant. In Datadog, you can filter actions by `@feature_flags.checkout_button_variant` to compare click-through rates between control and variant.

---

## Approach B: wiring in Statsig

If you're using Statsig, the SDK evaluation callback is the bridge into Datadog:

```ts
import { StatsigClient } from '@statsig/js-client';
import { datadogRum } from '@datadog/browser-rum';

const client = new StatsigClient('client-your-key', { userID: userId });
await client.initializeAsync();

const inVariant = client.checkGate('checkout_button_variant');

// This is the only Datadog-specific line you need
datadogRum.addFeatureFlagEvaluation('checkout_button_variant', inVariant);
```

From Datadog's perspective, the session looks identical to Approach A. The difference is who evaluated the flag: Statsig's engine, not Datadog's.

---

## Adding the kill switch: error tracking by variant

The real power of feature flags isn't the rollout — it's the rollback. But to roll back intelligently, you need to know which variant is causing problems.

Fire errors tagged with the variant context:

```ts
function simulateCheckoutError(variant: string) {
  const error = new Error('Payment gateway timeout');
  error.name = 'CheckoutError';
  datadogRum.addError(error, { variant });
}
```

In Datadog RUM → Errors, filter by:

```
@feature_flags.checkout_button_variant:variant
```

You'll see the error rate split by variant in real time. If the variant group's error rate spikes, flip the flag back to control. That's your kill switch — no redeploy, no incident, no rollback PR.

You can also automate this: create a Datadog monitor on the variant error rate and trigger a circuit breaker that disables the flag automatically when the threshold is crossed.

---

## Going server-side: Node.js + APM

Browser-side evaluation is great for UI experiments, but some targeting rules don't belong in the browser — account tier, internal employee flags, billing status. For those, evaluate on the server.

Datadog's Node.js SDK uses `dd-trace` under the hood, which means flag evaluations automatically attach to APM traces:

```bash
npm install dd-trace @openfeature/server-sdk
```

```ts
// tracer.ts — must be imported before everything else
import tracer from 'dd-trace';
import { OpenFeature } from '@openfeature/server-sdk';

tracer.init({
  service: 'checkout-api',
  env: 'production',
  experimental: {
    flaggingProvider: { enabled: true },
  },
});

OpenFeature.setProvider(tracer.openfeature);
```

```ts
// In your route handler
const client = OpenFeature.getClient();
const variant = await client.getStringValue(
  'checkout_button_variant',
  'control',
  { targetingKey: req.session.userId }
);
```

Every request that evaluates the flag gets a trace span annotated with the flag result. In Datadog APM, you can filter traces by variant and compare latency, error rates, and downstream service calls — the same analysis as RUM, but at the infrastructure layer.

### Which side should evaluate the flag?

This is a real architectural decision teams get wrong. A rough guide:

- **Browser** — UI changes, copy, colors, layout. Targeting based on URL, browser, anonymous session.
- **Server** — Pricing logic, algorithm changes, anything using sensitive user attributes (email, account tier, employee flag). Targeting based on data you don't want in client-side code.

When in doubt, evaluate on the server and pass the variant down to the client. You get the security benefits of server-side evaluation with the UX benefits of client-side rendering.

---

## What to look at in Datadog

Once your experiment is running, here's where to find the data:

**RUM → Sessions** — every session tagged with which variant the user saw. Filter by `@feature_flags.checkout_button_variant:variant` to see only variant sessions.

**RUM → Errors** — errors split by variant. This is your early warning system.

**RUM → Session Replay** — recordings for sessions in each variant. If variant users are rage-clicking or dropping off, you'll see it here without any extra instrumentation.

**APM → Traces** (server-side only) — traces annotated with flag evaluations. Compare p95 latency between control and variant on your checkout endpoint.

---

## The pattern in three steps

1. **Deploy** — ship the code behind a flag, off by default
2. **Roll out** — enable the flag for 5% of users, watch RUM and APM for 24 hours
3. **Decide** — error rate stable? Increase to 50%, then 100%. Spike? Flip the flag back in seconds.

The key insight is that step 3 is always available. You never have to choose between "ship fast" and "ship safely" — the flag gives you both.

---

## Running the sandbox

Clone the repo and set up your keys:

```bash
git clone <repo-url>
cd ab-test-sandbox/client
cp .env.example .env
# Add your Datadog Application ID and Client Token
npm install && npm run dev
```

Create a flag named `checkout_button_variant` in **Datadog → Software Delivery → Feature Flags** with two string variants: `control` and `variant`. Set a 50% rollout rule, enable the flag, and reload the sandbox.

For the server-side example:

```bash
cd ab-test-sandbox/server
DD_AGENT_HOST=localhost npm run dev
curl "http://localhost:3001/api/variant?userId=your-user-id"
```

---

The sandbox shows both approaches side by side with a working error simulator and kill switch demo. Everything that shows up in the screenshots is real data from a live Datadog org — no mocks.
