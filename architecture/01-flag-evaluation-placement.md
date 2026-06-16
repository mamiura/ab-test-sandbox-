# Proposal 1: Where Does Flag Evaluation Live?

## The problem

The loan application spans 8 steps across a mobile frontend and three backend services: identity verification, credit scoring, and offer generation. Evaluation needs to be consistent across all of them.

If each layer evaluates independently, you get divergence. The frontend puts the user in the variant. The identity service evaluates separately and puts them in control. The offer generation service sees a third result. The experiment is broken before it starts.

## Proposed architecture

**Evaluate once, at the authenticated session boundary.**

When the user starts a loan application, the API gateway or session service evaluates the flag and writes the result to the user's session record. Every subsequent request in that application flow reads the variant from the session, not from the flag SDK.

```
User opens app
  -> API Gateway evaluates flag for user ID
  -> Writes { application_id: "abc", variant: "B" } to session store
  -> All downstream services read variant from session context, not from flag SDK
```

The flag SDK is only called once per application lifecycle, not once per request or per service.

## Why not evaluate on the frontend?

The mobile app does not have a stable cross-device identity before login. A user on their laptop and the same user on their phone are anonymous sessions until authentication. If evaluation happens before login, they can get different variants.

More importantly, the variant affects backend behavior: which credit model runs, how offers are generated. Business logic that lives server-side should be controlled server-side. Putting that decision in client-side code means a user could manipulate it.

## Datadog integration

Use `dd-trace` with the OpenFeature server SDK on the API gateway service:

```ts
import tracer from 'dd-trace';
import { OpenFeature } from '@openfeature/server-sdk';

tracer.init({
  service: 'api-gateway',
  env: 'production',
  experimental: { flaggingProvider: { enabled: true } },
});

OpenFeature.setProvider(tracer.openfeature);
```

```ts
const client = OpenFeature.getClient();
const variant = await client.getStringValue(
  'loan_application_variant',
  'control',
  { targetingKey: req.user.id }
);

// Store on session, tag the trace
req.session.experimentVariant = variant;
tracer.scope().active()?.setTag('loan_application_variant', variant);
```

Every APM trace originating from this session is now tagged with the variant. You do not need to re-evaluate downstream.

## Tradeoffs

| Decision | Risk |
|---|---|
| Evaluate at API gateway | Single point -- if gateway is down, fallback to default variant |
| Evaluate per service | Variant divergence across services, broken experiment |
| Evaluate on frontend | Cross-device inconsistency, sensitive logic exposed in client |

The gateway approach requires that the session store is reliable and that all downstream services read from it rather than re-evaluating. That is an architectural contract you enforce at code review and document in your flag lifecycle governance.
