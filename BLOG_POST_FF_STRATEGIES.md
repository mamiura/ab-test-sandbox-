# Feature Flag Strategies: Frontend vs Backend, Continuous Rollout, and Experimentation

Feature flags are one of those tools that sound simple until you try to use them at scale. You add a flag, wrap some code, ship it. Easy. Then you have ten flags, then fifty, and suddenly you are debugging why a user in production is seeing behavior that does not match what the flag configuration says it should be.

The root cause is almost always the same: the team never made a deliberate decision about where flags should live, what they should control, what question they are trying to answer, or who is responsible for cleaning them up.

This post breaks down four decisions that matter most.

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

**A subtler problem: cross-device consistency.** If your targeting relies on client-side identifiers like a cookie or an anonymous session ID, the same user can land in different variants depending on where they open your app. They visit on a laptop and get variant A. They open on mobile and get variant B. The experiment is now broken for that user, and your results are contaminated with cross-device noise.

For logged-in experiences, this is one of the strongest arguments for backend evaluation. When the server uses a stable user identity as the targeting key, the same user always gets the same variant regardless of device, browser, or session state.

### Backend flags

Backend flags are evaluated on the server. The flag SDK runs inside your service, and the evaluation result stays server-side. The client only receives what the server decides to send.

```bash
npm install @openfeature/server-sdk dd-trace
```

```ts
import { OpenFeature } from '@openfeature/server-sdk';

// initialize once at startup (see Going Server-Side section of the companion post)
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
import { OpenFeature } from '@openfeature/server-sdk';

// Server: evaluate and include in the API response
const client = OpenFeature.getClient();
const variant = await client.getStringValue('checkout_redesign', 'control', {
  targetingKey: req.session.userId,
});
res.json({ ...pageData, variant });
```

```ts
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
import { OpenFeature } from '@openfeature/server-sdk';

const client = OpenFeature.getClient();

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
import { OpenFeature } from '@openfeature/server-sdk';
import { datadogRum } from '@datadog/browser-rum';

const client = OpenFeature.getClient();

// Experiment flag: multi-variant, metric-driven, data-focused
const variant = await client.getStringValue(
  'signup_flow_variant',
  'control',
  { targetingKey: req.session.userId }
);

datadogRum.addFeatureFlagEvaluation('signup_flow_variant', variant);
datadogRum.addAction('signup_step_viewed', { step: 'email', variant });
```

A common mistake is ending experiments early because the variant looks better after two days. Unless you are using a sequential testing methodology specifically designed for early stopping (Bayesian inference, SPRT, or a continuous monitoring framework), wait for your predetermined sample size. Peeking and stopping early inflates your false positive rate and leads to decisions that do not hold at scale.

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

This is where most teams stop short. They set up the flag, run the rollout or experiment, and then eyeball a dashboard and make a gut call.

Gut calls are fine when the signal is obvious: a 10x spike in errors is not subtle. But for experiments, gut calls are dangerous because human brains are wired to see patterns that are not there.

### For rollout flags

You need guardrail metrics: things that should not change. Error rate, p95 latency, session length. If any of these move in the wrong direction during the rollout, stop and investigate before increasing traffic.

Most flag providers, including Datadog, LaunchDarkly, and Statsig, let you attach your RUM or APM metrics directly to the flag configuration. In Datadog specifically, flag evaluations are natively correlated with RUM sessions and APM traces, so you can filter any metric by the variant without exporting data or writing custom queries.

```
@feature_flags.new_payment_processor:true
```

Apply that filter in RUM Errors or APM Traces and you immediately see whether the flagged group diverges from the control group. Set up a monitor on that filter so you get alerted rather than discovering the regression the next morning.

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

Track each step of the user journey as a RUM action:

```ts
import { datadogRum } from '@datadog/browser-rum';

datadogRum.addAction('signup_started', { variant });
datadogRum.addAction('email_entered', { variant });
datadogRum.addAction('profile_completed', { variant });
datadogRum.addAction('signup_completed', { variant });
```

In Datadog Product Analytics, build a funnel with these actions in order, then break it down by `@feature_flags.signup_flow_variant`. You can see whether the variant converts better at every step, not just at the final conversion event.

---

## Decision 4: Where does evaluation data go?

This decision does not get enough attention, and it is where most teams leave value on the table.

Flag evaluation and measurement are separate concerns, but they need to talk to each other. The typical flow looks like this:

1. **Flag provider evaluates** -- decides which variant each user sees and records the exposure
2. **Observability platform measures** -- captures what those users actually did: errors, latency, actions, sessions
3. **Analytics platform decides** -- joins the exposure data with the outcome data and computes lift

The problem: if these are three separate systems, someone has to export flag exposures, join them to session data, and build the analysis manually. That is the work that prevents most teams from actually measuring their flags.

The reason native integration matters is that the join happens automatically. In Datadog, flag evaluations are recorded directly into the RUM session at the moment of evaluation. There is no export, no ETL, no separate analysis pipeline. Every error, every action, every session replay, every APM trace is already tagged with the flag variant.

That means you can ask questions like:

- Which variant had higher p95 latency on checkout requests? (APM > Traces, filter by variant)
- Did variant B users have longer sessions? (RUM > Sessions, group by flag)
- Where in the funnel did variant A users drop off compared to variant B? (Product Analytics > Funnels, break down by flag)
- What did users in the losing variant actually do before they dropped off? (Session Replay, filter by flag)

These are questions you can answer in minutes, not days, because the data is already connected.

The practical implication for instrumentation: call `datadogRum.addFeatureFlagEvaluation()` at the moment of evaluation (the `DatadogProvider` does this automatically if you use the OpenFeature integration), and call `datadogRum.setUser()` with a stable user ID as early in the session as possible. The user identity is what enables Datadog to pull pre-experiment behavior for variance reduction, and what ties cross-session events back to the same person.

---

## Flag ownership and expiration

At scale, the biggest feature flag problem is not frontend vs backend, and it is not rollout vs experiment. It is this:

**Nobody knows who owns this flag anymore.**

You have a flag called `new_dashboard_layout` that has been at 100% for eight months. It was created by an engineer who left the company. The product manager who requested it moved to a different team. The flag is doing nothing, but nobody is confident enough to delete it.

This is how codebases accumulate dead code wrapped in conditional logic that nobody understands.

Every flag should have four things documented at creation:

- **Owner** -- the team or individual responsible for the decision to ship or remove it
- **Creation date** -- when it went into the codebase
- **Expected removal date** -- a specific target, not "when we're done"
- **Purpose** -- one sentence on what question this flag is answering or what risk it is managing

Most flag management tools, including Datadog, support custom metadata on flags. Use it. A flag with no expected removal date is a flag that will never be removed.

The expected removal date is not a hard deadline. It is a forcing function. When the date passes, someone has to make an active decision to extend it, which means someone has to look at the flag, understand its current state, and decide whether it still needs to exist. That is the behavior you want.

For experiment flags, the removal date is straightforward: set it to when you expect to reach statistical significance. For rollout flags, set it to when you expect to hit 100% and clean up. For kill switches and long-lived operational flags, set a review date instead of a removal date, and revisit on that schedule.

The team that takes flag hygiene seriously ends up with a codebase that is easier to reason about and an experimentation program that is faster to run, because nobody is spending time debugging flag interactions from six months ago.

---

## Putting it together: a flag lifecycle

Every flag should go through the same lifecycle regardless of type.

**1. Define the question before writing code**

For a rollout: what does "safe" look like? Define your error rate threshold and latency budget before you start. If you do not define it upfront, you will rationalize away the first regression you see.

For an experiment: what is the minimum detectable effect you care about? Use a sample size calculator to figure out how long you need to run before you can trust the result. Skipping this step is how teams end up running experiments for two weeks and declaring a winner on a difference that is not real.

**2. Document ownership at creation**

Fill in the owner, creation date, expected removal date, and purpose before the flag goes live. This takes two minutes and saves hours of archaeology later.

**3. Instrument before you ship**

Add your tracking calls before the flag goes live. You want baseline data from before the experiment starts so you have something to compare against. In Datadog, this baseline is also what enables CUPED: the variance reduction technique that uses pre-experiment user behavior to reduce the sample size you need to reach significance. No baseline data means no variance reduction, which means you need more traffic to reach the same confidence.

**4. Start small**

Start rollout flags at 1 to 5 percent. Start experiment flags at a split that gives you statistical power within a reasonable time window -- usually 50/50 unless you have a specific reason to weight it differently.

**5. Watch the guardrails**

Set up monitors for your guardrail metrics before you increase traffic. In Datadog, create a monitor on error rate filtered by the flag variant and set an alert threshold. If it fires, the on-call engineer knows exactly which flag to turn off without having to investigate first.

**6. Clean up**

The most important step, and the most skipped. After a rollout completes, delete the flag and the code path it controlled. After an experiment concludes, ship the winner, delete the loser, and remove the flag. If the expected removal date has passed and the flag is still live, treat that as a bug.

---

## The rule to remember

Frontend flags for what users see. Backend flags for what the system does. Rollout flags for managing risk. Experiment flags for answering questions. Connect your evaluation data to your observability platform so you do not have to answer those questions manually. Document ownership so someone is always responsible for the answer.

The discipline is not in the tooling. It is in making these decisions explicitly before you write a line of code.
