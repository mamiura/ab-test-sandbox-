# Proposal 5: Detecting Latency Correlation with a Variant

## The problem

After ramping the variant to 30%, the credit scoring vendor introduces a latency spike. The question is whether the spike is:

A. Correlated with the variant (the variant is triggering different behavior from the vendor)
B. A general vendor degradation affecting all users equally

Getting this wrong is costly in both directions. If you roll back the variant and the issue is general, you have lost experiment progress and delayed the decision. If you keep running and the variant is causing it, you have degraded 30% of your users' experience for no reason.

## Architecture diagram

```
  TRAFFIC SPLIT AT 30% RAMP
  ──────────────────────────────────────────────────────────────────

            All Loan Applications
                    │
           ┌────────┴────────┐
           │                 │
      70% control       30% variant
           │                 │
           ▼                 ▼
  ┌────────────────┐  ┌────────────────┐
  │  Credit Score  │  │  Credit Score  │
  │  Wrapper       │  │  Wrapper       │
  │  variant:ctrl  │  │  variant:B     │
  └───────┬────────┘  └───────┬────────┘
          │                   │
          └──────┬────────────┘
                 │  both call same vendor
                 ▼
        ┌─────────────────┐
        │   3rd Party     │
        │  Credit Vendor  │
        │                 │
        │  latency spike  │
        │  happening here │
        └─────────────────┘

  DATADOG APM SPLIT VIEW
  ──────────────────────────────────────────────────────────────────

  Filter: service:credit-scoring-wrapper span:credit_scoring.request
  Group by: loan_application_variant

  control  ████████░░░░░░░░░░░░░░░░░░░░  p95: 390ms   ◄── baseline
  variant  ██████████████████████░░░░░░  p95: 1820ms  ◄── spike

  Conclusion: variant is causing it (control is flat)

  vs. general vendor degradation:

  control  ██████████████████░░░░░░░░░░  p95: 1750ms  ◄── both up
  variant  ████████████████████░░░░░░░░  p95: 1820ms  ◄── both up

  Conclusion: general issue (both groups affected equally)

  MONITOR: AUTOMATED ALERT ON DIVERGENCE
  ──────────────────────────────────────────────────────────────────

  ┌────────────────────────────────────────────────────────────────┐
  │  Datadog Monitor                                               │
  │                                                               │
  │  Query:                                                       │
  │  avg(variant latency) > avg(control latency) * 1.5            │
  │  for 5 consecutive minutes                                    │
  │                                                               │
  │  Alert fires ──► PagerDuty / Slack                            │
  │                                                               │
  │  On-call engineer sees:                                       │
  │  "variant latency 4.7x control -- check loan_variant flag"   │
  │                                                               │
  │  Action: flip flag back to 0% in Datadog UI                  │
  │  Time to remediation: < 2 minutes                            │
  └────────────────────────────────────────────────────────────────┘

  FUNNEL DROP-OFF AS EARLY WARNING
  ──────────────────────────────────────────────────────────────────

  Product Analytics Funnel (break down by variant)

  Step                   Control    Variant B
  ─────────────────────────────────────────────
  loan_application_start  100%       100%
  identity_verified        91%        90%
  credit_score_received    87%        61%  ◄── drop-off spike here
  loan_offer_presented     82%        58%      before error rate
  loan_offer_accepted      31%        22%      reflects it
```

## How to distinguish them with Datadog APM

Because every trace is tagged with the variant (from Proposal 1), you can split the vendor latency by variant and look at the distributions independently.

In **APM > Traces**, filter:

```
service:credit-scoring-wrapper span.name:credit_scoring.request
```

Group by `loan_application_variant` and compare p95 latency:

- If control p95 = 400ms and variant p95 = 1800ms: the variant is causing it
- If control p95 = 1800ms and variant p95 = 1900ms: general vendor degradation

The latency of the vendor call is captured in your wrapper span even though the vendor itself is not instrumented. You are measuring your call to them, which is the number that matters.

## Proactive monitoring: automated split alert

```
# Datadog monitor: variant latency divergence
avg:trace.credit_scoring.request.duration{loan_application_variant:variant}
  > avg:trace.credit_scoring.request.duration{loan_application_variant:control} * 1.5
```

Alert condition: variant p95 exceeds control p95 by more than 50% for 5 consecutive minutes.

Add a parallel monitor on error rate:

```
# Error rate divergence
sum:trace.credit_scoring.request.errors{loan_application_variant:variant}.as_rate()
  > sum:trace.credit_scoring.request.errors{loan_application_variant:control}.as_rate() * 2
```

If both latency and error rate are elevated for the variant group and flat for control, the evidence is strong that the variant is triggering different vendor behavior.

## Using RUM to see the user impact

APM tells you the backend story. RUM tells you the user story.

In **RUM > Sessions**, filter by `@feature_flags.loan_application_variant:variant` and look at session duration and rage clicks on the credit scoring step. If variant users are waiting visibly longer and abandoning, that shows up as a funnel drop-off in Product Analytics before your support queue reflects it.

In **Product Analytics > Funnels**, break down by variant and compare completion rates at the `credit_score_received` step. A latency spike that causes timeouts will show up as a drop in funnel conversion before you have enough error data to be statistically confident.

## Decision framework

| Signal | Interpretation | Action |
|---|---|---|
| Variant latency up, control flat | Variant is causing it | Roll back variant, investigate |
| Both variant and control latency up | General vendor issue | Keep variant, file vendor incident |
| Variant latency up, funnel drop-off in variant only | User-visible impact, variant-caused | Roll back immediately |
| Latency up but error rate flat | Vendor slow but not failing | Escalate to vendor, monitor |

The flag is your escape hatch. Roll back takes seconds. The data from the monitors tells you whether to use it.
