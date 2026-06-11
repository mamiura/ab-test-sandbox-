# Feature Flag Strategies: Frontend vs Backend, Continuous Rollout, and Experimentation

Feature flags are one of those tools that sound simple until you try to use them at scale. You add a flag, wrap some code, ship it. Easy. Then you have ten flags, then fifty, and suddenly you are debugging why a user in production is seeing behavior that does not match what the flag configuration says it should be.

The root cause is almost always the same: the team never made a deliberate decision about where flags should live, what they should control, and what question they are trying to answer.

This post breaks down three decisions that matter most.

---

## Decision 1: Frontend or Backend?

This is the first question to answer for every flag you create, and the answer shapes everything else.

### Frontend flags

Frontend flags are evaluated in the browser. The SDK fetches flag configurations from a remote source, evaluates the targeting rules client-side, and returns a value your component can use immediately.

```ts
import { useStringFlagDetails } from '@openfeature/react-sdk';

const details = useStringFlagDetails('onboarding_flow_variant', 'control');
const variant = details.value === 'redesign' ? 'redesign' : 'control';
```

What they are good for:

- UI changes: copy, colors, layout, component visibility
- Progressive feature disclosure: show a new navigation item to 10% of users
- Anonymous user targeting: based on browser, geography, or session attributes
- Fast iteration: no server deploy needed to change what users see

What they are not good for:

- Anything that touches pricing, billing, or account data
- Targeting rules that depend on server-side attributes you do not want exposed in the browser
- Logic that needs to be consistent across multiple services

The key constraint with frontend flags is that the evaluation happens in an environment you do not control. Anyone can open DevTools and see the flag configuration. That is fine for a button color or a headline variant. It is not fine for "show enterprise pricing to users on the free plan."

### Backend flags

Backend flags are evaluated on the server. The flag SDK runs inside your service, and the evaluation result stays server-side. The client only receives what the server decides to send.

```ts
const client = OpenFeature.getClient();
const variant = await client.getStringValue(
  'recommendation_algorithm',
  'baseline',
  { targetingKey: req.session.userId }
);
```

What they are good for:

- Business logic changes: pricing rules, recommendation algorithms, rate limits
- Sensitive targeting: account tier, billing status, internal employee flags
- Cross-service consistency: multiple services need to agree on the same flag value
- Infrastructure experiments: database queries, caching strategies, API versions

What they are not good for:

- Pure UI changes where you need instant feedback without a round trip
- Anonymous users where you do not have a server-side identity yet

### The hybrid pattern

The most robust pattern for full-stack experiments is to evaluate on the server and pass the result down to the client. The server decides the variant, the client renders it.

```ts
// Server: evaluate and include in the API response
const variant = await client.getStringValue('checkout_redesign', 'control', {
  targetingKey: req.session.userId,
});
res.json({ ...pageData, variant });

// Client: render based on what the server decided
const { variant } = await fetchPageData();
```

This gives you the security of server-side evaluation with the rendering flexibility of the frontend. The tradeoff is an extra API call on page load, which is worth it any time the targeting logic should not be visible to end users.

### Decision guide

| Scenario | Where to evaluate |
|---|---|
| Button copy or color | Frontend |
| New UI component rollout | Frontend |
| Pricing logic change | Backend |
| Recommendation algorithm | Backend |
| Full-stack feature with UI and API changes | Backend, pass to frontend |
| Anonymous session experiment | Frontend |
| Logged-in user cohort experiment | Backend |

---

## Decision 2: Continuous Rollout vs Experiment

This is the second question that trips teams up. Feature flags can serve two very different purposes, and conflating them creates measurement problems.

### Continuous rollout

A rollout flag exists to reduce risk. You want to ship a change, but you do not want to expose everyone to it at once. You start at 1%, watch for errors, increase to 10%, watch again, and keep going until you reach 100% and delete the flag.

The question a rollout flag answers is: **is this change safe to ship to everyone?**

The success condition is simple: no spike in errors, no performance regression, no support tickets. Once you hit 100% and the metrics look clean, the flag has done its job and should be removed.

Rollout flags should be short-lived. A flag that stays in the codebase at 100% for more than a few weeks is technical debt. The code path it controls should become the default and the flag should be deleted.

```ts
// Rollout flag: binary, short-lived, safety-focused
const useNewPaymentProcessor = await client.getBooleanValue(
  'new_payment_processor',
  false,
  { targetingKey: req.session.userId }
);

if (useNewPaymentProcessor) {
  return newPaymentHandler(req, res);
}
return legacyPaymentHandler(req, res);
```

### Experiment flag

An experiment flag exists to answer a question. You have a hypothesis about user behavior and you want to test it with real traffic before making a permanent decision.

The question an experiment flag answers is: **which version produces better outcomes?**

Unlike a rollout flag, an experiment flag needs:

- A control group and at least one variant
- A defined success metric (conversion rate, error rate, revenue per session)
- A statistical significance threshold before you declare a winner
- A time window long enough to account for day-of-week effects

```ts
// Experiment flag: multi-variant, metric-driven, data-focused
const variant = await client.getStringValue(
  'signup_flow_variant',
  'control',
  { targetingKey: req.session.userId }
);

// Track the exposure so your analytics platform can correlate it
datadogRum.addFeatureFlagEvaluation('signup_flow_variant', variant);
datadogRum.addAction('signup_step_viewed', { step: 'email', variant });
```

The critical difference: you do not end an experiment early just because the variant looks better after two days. You wait for statistical significance. Ending early inflates your false positive rate and leads to decisions you will regret when the effect does not hold at scale.

### When to use which

| Situation | Flag type |
|---|---|
| Rewriting a payment flow | Rollout |
| Testing new onboarding copy to increase activation | Experiment |
| Migrating to a new database | Rollout |
| Testing two pricing page layouts | Experiment |
| Upgrading a third-party SDK | Rollout |
| Testing personalized recommendations | Experiment |

A useful rule of thumb: if you already know what the right answer is and you are managing risk, use a rollout flag. If you genuinely do not know which version is better and you need data to decide, use an experiment flag.

---

## Decision 3: What to measure

This is where most teams stop short. They set up the flag, they run the rollout or the experiment, and then they eyeball a dashboard and make a gut call.

Gut calls are fine when the signal is obvious: a 10x spike in errors is not subtle. But for experiments, gut calls are dangerous because human brains are wired to see patterns that are not there.

### For rollout flags

You need guardrail metrics: things that should not change. Error rate, p95 latency, session length. If any of these move in the wrong direction during the rollout, stop and investigate before increasing traffic.

In Datadog, filter RUM errors and APM traces by your flag evaluation:

```
@feature_flags.new_payment_processor:true
```

If the error rate for the flagged group diverges from the control group, you have found your signal. Set up a monitor on that filter so you get paged rather than discovering it in the morning.

```
# Datadog monitor query for rollout guardrail
sum:rum.error.count{@feature_flags.new_payment_processor:true}.as_rate()
  > sum:rum.error.count{@feature_flags.new_payment_processor:false}.as_rate() * 1.5
```

### For experiment flags

You need a primary metric (the thing you are trying to improve) and secondary metrics (things you are watching for unintended side effects).

Primary metric example for a signup experiment: `signup_completed` action rate per user.

Secondary metrics: error rate, session duration, step abandonment rate.

The secondary metrics protect you from winning on the primary metric but losing somewhere else. A new signup flow that completes more signups but drives more errors downstream is not a win.

In Datadog Product Analytics, build the funnel that matches your experiment scope:

```ts
datadogRum.addAction('signup_started', { variant });
datadogRum.addAction('email_entered', { variant });
datadogRum.addAction('profile_completed', { variant });
datadogRum.addAction('signup_completed', { variant });
```

Then break the funnel down by `@feature_flags.signup_flow_variant`. You can see whether the variant converts better at every step, not just at the final conversion event.

In the **Experiments** tab of the feature flag, configure your primary and failure metrics. Datadog calculates relative lift and statistical significance automatically and shows you how many more exposures you need before the result is trustworthy.

---

## Putting it together: a flag lifecycle

Every flag should go through the same lifecycle regardless of type.

**1. Define the question before writing code**

For a rollout: what does "safe" look like? Define your error rate threshold and latency budget before you start. If you do not define it upfront, you will rationalize away the first regression you see.

For an experiment: what is the minimum detectable effect you care about? Use a sample size calculator to figure out how long you need to run before you can trust the result. Skipping this step is how teams end up running experiments for two weeks and declaring a winner on a difference that is not real.

**2. Instrument before you ship**

Add your tracking calls before the flag goes live. You want baseline data from before the experiment starts so you have something to compare against. In Datadog, this is what enables CUPED: the variance reduction technique that uses pre-experiment user behavior to clean up your results. No baseline data means no variance reduction, which means you need more traffic to reach the same confidence.

**3. Start small**

Start rollout flags at 1 to 5 percent. Start experiment flags at a split that gives you statistical power within a reasonable time window -- usually 50/50 unless you have a specific reason to weight it differently.

**4. Watch the guardrails**

Set up monitors for your guardrail metrics before you increase traffic. In Datadog, create a monitor on error rate filtered by the flag variant and set an alert threshold. If it fires, the on-call engineer knows exactly which flag to turn off without having to investigate first.

**5. Clean up**

The most underrated step. After a rollout completes, delete the flag and the code path it controlled. After an experiment concludes, ship the winner, delete the loser, and remove the flag. Stale flags are the reason codebases become hard to reason about. A flag at 100% with no expiration date is just dead code with extra steps.

---

## The rule to remember

Frontend flags for what users see. Backend flags for what the system does. Rollout flags for managing risk. Experiment flags for answering questions. Measure everything before you decide.

The discipline is not in the tooling. It is in making these decisions explicitly before you write a line of code.
