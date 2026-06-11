# How to Run Your First A/B Test Without Breaking Production and Actually Measure It

You shipped a UI change to 100% of your users. Conversion dropped 12%. You rolled it back three hours later, but by then thousands of sessions had already hit the broken experience.

This is not a hypothetical. It happens to teams of every size, and it usually happens for the same reason: the change was deployed and exposed to users at the same time. There was no middle ground between "off" and "everyone."

Feature flags fix this. They decouple deployment from release, letting you ship code to production and expose it to users gradually: 1%, 10%, 50%, with a kill switch at every step.

But flags alone are not enough. You need to know what happened during the rollout: did conversion improve, did errors spike, where did users drop off? That is where observability comes in.

In this post, I will walk through building a full experiment stack on top of a 5-step e-commerce funnel. We will cover:

1. A/B testing a checkout button with Datadog Native Feature Flags
2. Tracking errors by variant with a kill switch
3. Building a Product Analytics funnel to measure drop-off across the full user journey
4. Going server-side with Node.js and APM

The full sandbox is on GitHub if you want to follow along: [github.com/mamiura/ab-test-sandbox-](https://github.com/mamiura/ab-test-sandbox-)

---

## The experiment: checkout button copy and color

We are testing two variants on a checkout button inside a 5-step funnel:

**Landing > Product > Cart > Checkout > Confirmation**

- **Control** — "Buy Now" (blue)
- **Variant** — "Complete Purchase" (green)

Simple enough to build in an afternoon. Complex enough to show every layer of the stack: flag evaluation, RUM correlation, funnel analysis, session replay, error tracking, and rollback.

---

## How Datadog Feature Flags work

Datadog's feature flag product evaluates flags client-side using rules you define in the Datadog UI. The SDK is built on [OpenFeature](https://openfeature.dev/), an open standard, which means you are not locked into Datadog-specific APIs.

Flag evaluations are **natively correlated** with RUM sessions, errors, and session replays with no extra instrumentation needed. When an error occurs, you can see exactly which flag variant that user was in.

---

## Building the experiment

### Setup

```bash
npm create vite@latest ab-test-sandbox -- --template react-ts
cd ab-test-sandbox
npm install @datadog/openfeature-browser @openfeature/react-sdk @openfeature/web-sdk @openfeature/core
```

### Initialize the provider

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
  targetingKey: currentUser.id,
});

root.render(
  <OpenFeatureProvider>
    <App />
  </OpenFeatureProvider>
);
```

The `targetingKey` is how Datadog assigns users to variants. The same key always gets the same variant, giving users a consistent experience across sessions.

### Evaluate the flag in a component

```ts
import { useStringFlagDetails } from '@openfeature/react-sdk';

function useCheckoutVariant() {
  const details = useStringFlagDetails('checkout_button_variant', 'control');
  return details.value === 'variant' ? 'variant' : 'control';
}
```

The `DatadogProvider` automatically calls `datadogRum.addFeatureFlagEvaluation()` on every evaluation, so your RUM sessions are tagged with the flag result without any extra code.

### Track user identity for retention analysis

```ts
datadogRum.setUser({ id: userId, name: userName });
```

Call this once when the user is known. It ties every RUM event, including actions, errors, and session replays, to a single user identity. This is what powers retention analysis in Datadog Product Analytics.

---


## Adding the kill switch: error tracking by variant

The real power of feature flags is not the rollout, it is the rollback. But to roll back intelligently, you need to know which variant is causing problems.

```ts
const error = new Error('Payment gateway timeout');
error.name = 'CheckoutError';
datadogRum.addError(error, { variant });
```

In Datadog **RUM > Errors**, filter by:

```
@feature_flags.checkout_button_variant:variant
```

You will see the error rate split by variant in real time. If the variant group's error rate spikes, flip the flag back to control. No redeploy, no incident, no rollback PR.

In the **Experiments** tab of your feature flag, configure:
- **Failure metric** — RUM Errors filtered by `@error.type:CheckoutError`
- **Conversion metric** — RUM Action `checkout_clicked`

Datadog will calculate relative lift and statistical significance automatically.

---

## Product Analytics: measuring the full funnel

A/B testing tells you which button variant converts better at the moment of the click. Product Analytics tells you whether users even got to the button.

Track each step of the funnel as a RUM action:

```ts
datadogRum.addAction('landing_viewed');
datadogRum.addAction('product_viewed', { product_id: 'watch-001', price: 299 });
datadogRum.addAction('cart_viewed', { items: 1, total: 299 });
datadogRum.addAction('checkout_viewed', { variant });
datadogRum.addAction('purchase_completed', { variant, total: 299 });
```

In Datadog **Product Analytics > Funnels**, create a funnel with these actions in order. You will immediately see drop-off rate at each step, where the biggest leaks are, and whether the variant group converts differently across the entire funnel, not just at checkout.

This is the insight that changes the question from "which button is better?" to "why are 55% of users dropping off before they even reach the cart?"

### Session Replay closes the loop

Every session in the funnel is automatically recorded. When you see a drop-off spike at the cart step, click into a session replay and watch what that user actually did. No extra instrumentation. No guessing.

You can also break down the funnel by feature flag variant using **Break down by** in the funnel builder. Set it to `@feature_flags.checkout_button_variant` and you get two parallel funnels, one for control users and one for variant, so you can compare drop-off across the entire journey.

---

## Going server-side: Node.js + APM

Browser-side evaluation works for UI experiments. Server-side is for anything using sensitive user attributes like account tier, billing status, or internal employee flags that should not live in client-side code.

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
  experimental: { flaggingProvider: { enabled: true } },
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

Every request gets a trace span annotated with the flag result. In **APM > Traces**, filter by variant and compare p95 latency, error rates, and downstream calls between control and variant.

Note: this requires Datadog Agent 7.55+ with Remote Configuration enabled. Without Remote Configuration, the Agent cannot distribute flag configurations to the SDK.

### Which side should evaluate the flag?

- **Browser** — UI changes, copy, colors. Targeting based on URL or anonymous session.
- **Server** — Pricing logic, algorithms, sensitive user attributes. Anything you do not want exposed in client-side code.

When in doubt, evaluate on the server and pass the variant down to the client.

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

Running an A/B test costs time. Every day you run, you are holding back a better experience from half your users, or shipping a worse one. The faster you can reach statistical significance, the faster you can ship the winner.

CUPED (Controlled-experiment Using Pre-Experiment Data) is a variance reduction technique introduced by Microsoft Research in 2013 and now used by Netflix, Airbnb, LinkedIn, and Booking.com. The core idea: use what you already know about each user to remove noise from the experiment result.

### The problem CUPED solves

Your conversion metric has variance. Some users always buy. Some users never buy. That pre-existing difference has nothing to do with your experiment, but it shows up in your data and makes it harder to detect the actual signal.

If user A always converts at 80% and user B always converts at 20%, and both end up in the control group, the average for control is noisy regardless of what your button looks like.

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

Datadog can apply CUPED automatically when pre-experiment user data is available, but it needs a stable user identity to look up that history. This is why calling `datadogRum.setUser()` matters beyond just retention analysis:

```ts
datadogRum.setUser({ id: userId, name: userName });
```

Without a consistent user ID, Datadog cannot match experiment sessions to pre-experiment behavior. Anonymous sessions have no history to adjust against. The earlier you call `setUser()` in the session, the more pre-experiment data Datadog can pull for each user.

### What you get in practice

For a checkout experiment with typical conversion variance, CUPED can cut the required sample size by 30 to 50 percent. If you originally needed 10,000 users per variant to detect a 5% lift, you may only need 5,000 to 7,000 after adjustment.

The math runs automatically on Datadog's side when pre-experiment data exists. Your job is to make sure users are identified consistently across sessions so the history is there to use.

---

## The pattern in three steps

1. **Deploy** -- ship the code behind a flag, off by default
2. **Roll out** -- enable for 5% of users, watch RUM, APM, and the funnel for 24 hours
3. **Decide** -- metrics stable? Increase to 50%, then 100%. Spike? Flip the flag back in seconds.

The key insight is that step 3 is always available. You never have to choose between shipping fast and shipping safely.

---

## Running the sandbox

```bash
git clone https://github.com/mamiura/ab-test-sandbox-
cd ab-test-sandbox-/client
cp .env.example .env
# Add your Datadog Application ID and Client Token
npm install && npm run dev
```

Create a flag named `checkout_button_variant` in **Datadog > Software Delivery > Feature Flags** with two string variants (`control`, `variant`), set a 50% rollout rule, enable it for `production`, and reload the sandbox.

Walk through the funnel, use the user switcher to simulate different users, and watch the data appear in Datadog RUM, Product Analytics, and the Experiments tab.
