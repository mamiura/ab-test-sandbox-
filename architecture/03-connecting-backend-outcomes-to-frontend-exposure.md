# Proposal 3: Connecting Backend Outcomes to Frontend Flag Exposures

## The problem

The flag exposure happens on the frontend: the user opens the app, gets assigned a variant, and the RUM session is tagged. The conversion event ("loan offer accepted") happens on the offer generation backend service. These are two different systems with no automatic link between them.

Without a bridge, you have exposure data in RUM and conversion data in APM, but no way to join them and compute lift.

## Architecture diagram

```
  EXPOSURE (frontend)                    OUTCOME (backend)
  ──────────────────────────────────────────────────────────────────

  ┌─────────────────────────────┐      ┌──────────────────────────┐
  │         Mobile App          │      │    Offer Generation      │
  │                             │      │       Service            │
  │  datadogRum.setUser({       │      │                          │
  │    id: "u123"               │      │  span.setTag(            │
  │  })                         │      │    'usr.id', 'u123'      │
  │                             │      │  )                       │
  │  addFeatureFlagEvaluation(  │      │  span.setTag(            │
  │    'loan_variant', 'B'      │      │    'loan_variant', 'B'   │
  │  )                          │      │  )                       │
  │                             │      │                          │
  │  addAction(                 │      │  statsd.increment(       │
  │    'loan_offer_presented'   │      │    'loan.offer.accepted',│
  │  )                          │      │    { variant: 'B',       │
  └──────────────┬──────────────┘      │      usr_id: 'u123' }   │
                 │                     │  )                       │
                 │                     └───────────┬──────────────┘
                 │                                 │
                 ▼                                 ▼
  ┌──────────────────────────────────────────────────────────────────┐
  │                          Datadog                                  │
  │                                                                  │
  │   RUM Session (usr.id: u123)        APM Trace (usr.id: u123)    │
  │   ┌─────────────────────────┐       ┌────────────────────────┐  │
  │   │ feature_flag: variant:B │       │ loan_variant: B        │  │
  │   │ action: offer_presented │       │ span: offer.accepted   │  │
  │   │ session_replay: yes     │       │ latency: 280ms         │  │
  │   └─────────────────────────┘       └────────────────────────┘  │
  │                     │                          │                 │
  │                     └──────────┬───────────────┘                 │
  │                                │  joined by usr.id               │
  │                                ▼                                 │
  │              ┌────────────────────────────────┐                  │
  │              │   Feature Flags > Experiments   │                  │
  │              │                                │                  │
  │              │  Control: 31% offer accepted   │                  │
  │              │  Variant: 44% offer accepted   │                  │
  │              │  Lift: +42%  p < 0.05          │                  │
  │              └────────────────────────────────┘                  │
  └──────────────────────────────────────────────────────────────────┘

  FALLBACK: offer accepted outside the app (email/SMS link)
  ──────────────────────────────────────────────────────────────────

  ┌──────────────────┐    ┌─────────────────────────────────────────┐
  │   Email / SMS    │    │        Offer Generation Service          │
  │   (user clicks   │    │                                         │
  │    accept link)  │───►│  emits custom metric with usr.id +      │
  │                  │    │  variant tag regardless of whether       │
  │  no RUM session  │    │  app is open                            │
  └──────────────────┘    └─────────────────────────────────────────┘
```

## The bridge: stable user identity

The connection point is the user ID. Both systems need to reference the same identifier.

On the frontend, set the user identity as early as possible after authentication:

```ts
import { datadogRum } from '@datadog/browser-rum';

datadogRum.setUser({ id: user.id, name: user.name });
datadogRum.addFeatureFlagEvaluation('loan_application_variant', variant);
```

On the backend, tag every trace with the same user ID:

```ts
import tracer from 'dd-trace';

tracer.scope().active()?.setTag('usr.id', req.user.id);
tracer.scope().active()?.setTag('loan_application_variant', req.session.experimentVariant);
```

When the offer is accepted, emit a RUM action from the mobile client and a custom metric from the backend:

```ts
// Mobile client
datadogRum.addAction('loan_offer_accepted', {
  variant: storedVariant,
  offer_amount: offer.amount,
});
```

```ts
// Offer generation service
const statsd = tracer.dogstatsd;
statsd.increment('loan.offer.accepted', 1, {
  variant: req.session.experimentVariant,
  usr_id: req.user.id,
});
```

## Using the connection in Datadog

With user ID present in both RUM sessions and APM traces, Datadog can correlate them:

- In **RUM > Sessions**, filter by `@usr.id` and see the full session including the flag exposure event
- In **APM > Traces**, filter by `@usr.id` and see the backend conversion event on the same user
- In **Feature Flags > Experiments**, configure the conversion metric as either the RUM action or the custom metric from the backend

For the experiment metric, the backend custom metric is more reliable because it does not depend on the user returning to the app after the offer is generated (some users accept via SMS or email links).

## Datadog Product Analytics funnel

```ts
datadogRum.addAction('loan_application_started', { variant });
datadogRum.addAction('identity_verified', { variant });
datadogRum.addAction('credit_score_received', { variant });
datadogRum.addAction('loan_offer_presented', { variant });
datadogRum.addAction('loan_offer_accepted', { variant });
```

Break the funnel down by `@feature_flags.loan_application_variant`. This shows where each variant group drops off across the entire application journey, not just at the final step.

## Fallback: server-side event forwarding

If the offer acceptance happens outside the app (the user clicks a link in an email), the mobile RUM session will not capture it. In this case, the backend service emits the event to a custom metric with the user ID and variant tag. The experiment analysis reads from the metric rather than the RUM action.

This is a second reason why `datadogRum.setUser()` matters beyond session continuity: it is the key that lets you join any backend event back to the originating experiment exposure.
