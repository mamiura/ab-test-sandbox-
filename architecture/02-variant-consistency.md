# Proposal 2: Variant Consistency Across Devices and Services

## The problem

Two consistency guarantees are required:

1. A user who starts an application on mobile and returns on desktop must see the same variant
2. Three backend services, including one third-party vendor that cannot be instrumented, must all operate on the same variant assignment

## Cross-device consistency

The root cause of cross-device divergence is using a device-scoped identifier (cookie, device ID, anonymous session) as the targeting key. The fix is to evaluate the flag against a user-scoped identifier only after authentication.

```
Anonymous session -> no flag evaluation, default behavior
User authenticates -> flag evaluated against user ID
Result stored in user session record (not device)
All subsequent requests resolve variant from session record
```

If the user closes the app and returns three days later on a different device, they authenticate and the variant is read from their session record. The flag SDK is not re-evaluated. The variant is deterministic for the lifetime of that application, regardless of device.

This requires that you do not call `OpenFeature.setProvider()` with a targeting key until after login. Pre-login flows use the default value.

## Cross-service consistency

For the two internal services (identity verification and offer generation), pass the variant as a propagated trace tag and as an explicit request parameter:

```ts
// API Gateway -- outgoing request to identity service
const headers = {
  'X-Experiment-Variant': req.session.experimentVariant,
  ...tracer.inject(span, 'http_headers'),
};
```

Each internal service reads `X-Experiment-Variant` from the incoming request header. They do not evaluate the flag themselves. If the header is missing, they fall back to the default behavior and log a warning.

## Handling the uninstrumentable third-party vendor

The credit scoring vendor cannot be instrumented directly, but your service wraps every call to it. You control the request and the response.

```ts
// Your credit scoring wrapper service
async function getCreditScore(userId: string, variant: string): Promise<CreditScore> {
  const span = tracer.startSpan('credit_scoring.request');
  span.setTag('loan_application_variant', variant);

  try {
    const result = await vendorClient.score(userId);
    span.setTag('vendor.response_status', result.status);
    return result;
  } finally {
    span.finish();
  }
}
```

The vendor's behavior is a black box, but your wrapper span captures the latency, the response status, and the variant. In APM, you can filter on `loan_application_variant` and see the vendor's p95 latency split by variant without the vendor knowing the experiment exists.

## Datadog integration

Datadog's trace context propagation handles the internal service correlation automatically when `dd-trace` is initialized on each service. The `X-Experiment-Variant` header is a belt-and-suspenders backup for cases where trace context is not propagated (async jobs, batch processes, external queues).

In **APM > Service Map**, filter by `@loan_application_variant:variant` to see which services are touched by variant traffic and whether any show elevated error rates.

## What breaks without this

If each service re-evaluates the flag independently, the variant assignment depends on when the evaluation happens and what targeting rules are active at that moment. A flag config update mid-application puts the user in control for step 1 and variant for step 5. The experiment data is unusable.
