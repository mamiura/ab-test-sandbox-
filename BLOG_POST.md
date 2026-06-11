# How to Run an A/B Test Without Breaking Production and Actually Measure It

You shipped a UI change to 100% of your users. Conversion dropped 12%. You rolled it back three hours later, but by then thousands of sessions had already hit the broken experience.

This is not a hypothetical. It happens to teams of every size, and it usually happens for the same reason: the change was deployed and exposed to users at the same time. There was no middle ground between "off" and "everyone."

Feature flags fix this. They decouple deployment from release, letting you ship code to production and expose it to users gradually: 1%, 10%, 50%, with a kill switch at every step.

But flags alone are not enough. You need to know what happened during the rollout: did conversion improve, did errors spike, where did users drop off? That is where observability comes in.

This post walks through the full pattern: setting up a feature flag experiment with Datadog, wiring up error tracking and a kill switch, measuring the complete user funnel with Product Analytics, going server-side with APM, and using variance reduction to reach statistical significance faster.

---

## How Datadog Feature Flags work

Datadog's feature flag product evaluates flags client-side using rules you define in the Datadog UI. The SDK is built on [OpenFeature](https://openfeature.dev/), an open standard, which means your flag evaluation code is not tied to Datadog-specific APIs and can be swapped without rewriting your application logic.

The part that makes Datadog flags different from most implementations: evaluations are **natively correlated** with RUM sessions, errors, and session replays with no extra instrumentation. When an error fires, you can see exactly which flag variant that user was in. You do not need to join data across tools or write custom log parsing.

---

## Setting up the experiment

A typical experiment tests two variants of a user-facing interaction: a different button label, a redesigned form, a new checkout flow. The control group sees the existing experience. The variant group sees the change. You measure which performs better.

### Install the SDK

```bash
npm install @datadog/openfeature-browser @openfeature/react-sdk @openfeature/web-sdk @openfeature/core
```

### Initialize the provider

```ts
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
  targetingKey: currentUser.id,
});

root.render(
  <OpenFeatureProvider>
    <App />
  </OpenFeatureProvider>
);
```

The `targetingKey` is how Datadog assigns users to variants. The same key always gets the same variant, giving users a consistent experience across sessions and page reloads.

### Evaluate the flag in a component

```ts
import { useStringFlagDetails } from '@openfeature/react-sdk';

function useCheckoutVariant() {
  const details = useStringFlagDetails('checkout_button_variant', 'control');
  return details.value === 'variant' ? 'variant' : 'control';
}
```

The `DatadogProvider` automatically calls `datadogRum.addFeatureFlagEvaluation()` on every evaluation. Your RUM sessions are tagged with the flag result without any extra code.

### Track user identity

```ts
datadogRum.setUser({ id: userId, name: userName });
```

Call this once when the user is known. It ties every RUM event to a single user identity: actions, errors, replays, and flag evaluations all resolve to the same person. This is what powers retention analysis, cohort comparisons, and variance reduction (more on that later).

---

## The kill switch: error tracking by variant

The real power of feature flags is not the rollout, it is the rollback. But to roll back intelligently, you need to know which variant is causing problems before users start filing tickets.

Name your errors so you can filter them precisely:

```ts
const error = new Error('Payment gateway timeout');
error.name = 'CheckoutError';
datadogRum.addError(error, { variant });
```

In **RUM > Errors**, filter by variant:

```
@feature_flags.checkout_button_variant:variant
```

You will see the error rate split by variant in real time. If the variant group's error rate spikes above your threshold, flip the flag back to control. No redeploy. No incident. No rollback PR.

In the **Experiments** tab of your feature flag, configure:
- **Failure metric** -- RUM Errors filtered by `@error.type:CheckoutError`
- **Conversion metric** -- the RUM action that represents a successful outcome

Datadog calculates relative lift and statistical significance automatically. You are looking at two numbers: is the variant converting better, and is the variant breaking more? Both questions are answered in the same view.

---

## Product Analytics: measuring the full funnel

A/B testing tells you which variant converts better at the moment of the click. Product Analytics tells you whether users even got to that click.

Track each step of the user journey as a RUM action when it occurs:

```ts
datadogRum.addAction('landing_viewed');
datadogRum.addAction('product_viewed', { category: 'electronics', price: 299 });
datadogRum.addAction('cart_viewed', { item_count: 1, total: 299 });
datadogRum.addAction('checkout_viewed', { variant });
datadogRum.addAction('purchase_completed', { variant, total: 299 });
```

In **Product Analytics > Funnels**, build a funnel with these actions in order. You immediately see drop-off rate at each step: where the biggest leaks are, which steps lose the most users, and whether the variant group converts differently at every point in the journey, not just at the last step.

This shifts the question from "which button is better?" to "why are 55% of users dropping off before they even reach checkout?" That second question is usually worth more than the first.

### Session Replay closes the loop

Every session in the funnel is automatically recorded. When you see a drop-off spike at a specific step, click into a session replay and watch what that user actually did. No additional instrumentation needed.

Break down the funnel by feature flag variant using **Break down by** in the funnel builder. Set the attribute to `@feature_flags.checkout_button_variant` and you get two parallel funnels: one for control, one for variant. You can compare drop-off across the entire journey, not just the conversion event you defined as your metric.

---

## Going server-side: Node.js + APM

Browser-side evaluation works for UI experiments. Server-side is for anything that uses sensitive user attributes: account tier, billing status, internal employee flags, or business logic you do not want exposed in client-side code.

```bash
npm install dd-trace @openfeature/server-sdk
```

```ts
// tracer.ts -- must be the first import in your entry point
import tracer from 'dd-trace';
import { OpenFeature } from '@openfeature/server-sdk';

tracer.init({
  service: 'your-api-service',
  env: 'production',
  experimental: { flaggingProvider: { enabled: true } },
});

OpenFeature.setProvider(tracer.openfeature);
```

```ts
// In a route handler
const client = OpenFeature.getClient();
const variant = await client.getStringValue(
  'checkout_button_variant',
  'control',
  { targetingKey: req.session.userId }
);
```

Every request gets a trace span annotated with the flag result. In **APM > Traces**, filter by variant and compare p95 latency, error rates, and downstream service calls between control and variant. If the variant is slower, you will see it in the trace before it becomes a user-visible problem.

This requires Datadog Agent 7.55+ with Remote Configuration enabled. Without Remote Configuration, the Agent cannot distribute flag configurations to the SDK. Enable it in **Organization Settings > Remote Configuration** and add the Remote Configuration Read permission to your Agent's API key.

### Which side should evaluate the flag?

- **Browser** -- UI changes, copy, colors, layout. Targeting based on URL, geography, or anonymous session.
- **Server** -- pricing logic, algorithms, sensitive user attributes. Anything you do not want in client-side code.

When in doubt, evaluate on the server and pass the variant down to the client. The extra API call is a small cost for the guarantee that targeting logic stays server-side.

---

## What to look at in Datadog

| Where | What you get |
|---|---|
| **RUM > Sessions** | Every session tagged with the flag variant |
| **RUM > Errors** | Error rate split by variant, your kill switch signal |
| **RUM > Session Replay** | Recordings correlated with flag variant and funnel step |
| **Feature Flags > Experiments** | Statistical lift, conversion vs. failure metrics |
| **Product Analytics > Funnels** | Full funnel drop-off broken down by variant |
| **APM > Traces** | Server-side flag evaluations correlated with latency |

---

## Reducing sample size with CUPED

Running an A/B test costs time. Every day you run, you are holding back a better experience from half your users, or shipping a worse one. The faster you reach statistical significance, the faster you can ship the winner.

CUPED (Controlled-experiment Using Pre-Experiment Data) is a variance reduction technique introduced by Microsoft Research in 2013 and now used by Netflix, Airbnb, LinkedIn, and Booking.com. The idea: use what you already know about each user to remove noise from the experiment result.

### The problem CUPED solves

Your conversion metric has variance. Some users always buy. Some users never buy. That pre-existing difference has nothing to do with your experiment, but it shows up in your data and makes it harder to detect the actual signal.

If user A always converts at 80% and user B always converts at 20%, and both end up in the control group, the average for control is noisy regardless of what your variant looks like.

CUPED strips that noise out.

### How it works

For each user, you compute a covariate X: something measured before the experiment started, such as their conversion rate in the prior 30 days. Then you adjust their experiment-period outcome Y:

```
Y_cuped = Y - theta * X
```

Where theta is estimated from the data:

```
theta = Cov(Y, X) / Var(X)
```

The adjustment subtracts the portion of Y that is already explained by X. What is left is cleaner signal. Users who always convert are no longer inflating the variant group. Users who never convert are no longer dragging down the control group.

In practice, if the covariate correlates with the outcome at r = 0.7, CUPED reduces variance by 49%. That means you can reach the same statistical power with roughly half the sample size, or reach significance in half the time.

### What this requires from your instrumentation

Datadog can apply CUPED automatically when pre-experiment user data is available, but it needs a stable user identity to look up that history. This is why `datadogRum.setUser()` matters beyond session continuity:

```ts
datadogRum.setUser({ id: userId, name: userName });
```

Without a consistent user ID, Datadog cannot match experiment sessions to pre-experiment behavior. Anonymous sessions have no history to adjust against. The earlier you call `setUser()` in the session, the more pre-experiment data Datadog can pull for each user.

### What you get in practice

For a checkout experiment with typical conversion variance, CUPED can cut the required sample size by 30 to 50 percent. If you originally needed 10,000 users per variant to detect a 5% lift, you may only need 5,000 to 7,000 after adjustment.

The math runs on Datadog's side automatically when pre-experiment data exists. Your job is to make sure users are identified consistently across sessions so the history is there to use.

---

## The pattern in three steps

1. **Deploy** -- ship the code behind a flag, off by default
2. **Roll out** -- enable for 5% of users, watch RUM, APM, and the funnel for 24 hours
3. **Decide** -- metrics stable? Increase to 50%, then 100%. Spike? Flip the flag back in seconds.

The key insight is that step 3 is always available. You never have to choose between shipping fast and shipping safely. The flag is your escape hatch, but only if you have the observability to know when to use it.

---

A companion sandbox with a working React + Node.js implementation of everything in this post is on GitHub: [github.com/mamiura/ab-test-sandbox-](https://github.com/mamiura/ab-test-sandbox-)
