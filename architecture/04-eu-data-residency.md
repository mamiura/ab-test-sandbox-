# Proposal 4: EU Data Residency Compliance

## The constraint

No user behavioral data can leave the EU region. This covers RUM sessions, APM traces, logs, session replays, and any custom metrics that contain user identifiers.

## Architecture diagram

```
  ┌─────────────────────────────────────────────────────────────────┐
  │                        EU REGION BOUNDARY                        │
  │                                                                  │
  │   ┌──────────────┐         ┌──────────────────────────────────┐ │
  │   │  Mobile App  │         │         Backend Services          │ │
  │   │              │         │                                  │ │
  │   │  RUM SDK     │         │  dd-trace                        │ │
  │   │  site:       │         │  DD_SITE=datadoghq.eu            │ │
  │   │  datadoghq.eu│         │                                  │ │
  │   │              │         │  ┌────────────────────────────┐  │ │
  │   │  privacy:    │         │  │   Datadog Agent            │  │ │
  │   │  mask (PII)  │         │  │   site: datadoghq.eu       │  │ │
  │   └──────┬───────┘         │  │   Remote Config: enabled   │  │ │
  │          │                 │  └────────────┬───────────────┘  │ │
  │          │                 │               │                  │ │
  │          └────────┬────────┘               │                  │ │
  │                   │  all traffic           │                  │ │
  │                   ▼  stays in EU           ▼                  │ │
  │          ┌────────────────────────────────────────────┐       │ │
  │          │            datadoghq.eu                     │       │ │
  │          │                                            │       │ │
  │          │  RUM sessions  APM traces  Logs  Metrics   │       │ │
  │          │  Session Replay             Feature Flags  │       │ │
  │          └────────────────────────────────────────────┘       │ │
  │                                                                  │
  │   ┌────────────────────────────────────────────────────────┐    │
  │   │  3rd Party Credit Scoring Vendor                        │    │
  │   │                                                         │    │
  │   │  governed by vendor DPA, not by your Datadog config     │    │
  │   │  your traces capture latency + response codes only,     │    │
  │   │  not request payload -- stays compliant                 │    │
  │   └────────────────────────────────────────────────────────┘    │
  │                                                                  │
  └─────────────────────────────────────────────────────────────────┘

  SESSION REPLAY: PII MASKING LAYERS
  ──────────────────────────────────────────────────────────────────

  ┌──────────────────────────────────────────────────────────────┐
  │  Loan Application Screen                                      │
  │                                                              │
  │  [Step 3 of 8]          ← data-dd-privacy="allow" (visible) │
  │                                                              │
  │  Annual Income: ████    ← input field (auto-masked)          │
  │  SSN: ████████          ← input field (auto-masked)          │
  │                                                              │
  │  [Continue]             ← data-dd-privacy="allow" (visible) │
  └──────────────────────────────────────────────────────────────┘
```

## Datadog configuration

Datadog operates separate regional sites. EU data stays in the EU site (`datadoghq.eu`) and is physically isolated from the US site (`datadoghq.com`). This is a configuration choice made at account creation, not a filter applied after the fact.

If the customer's Datadog org is on `datadoghq.com`, they need a separate EU org or need to migrate. Data cannot be retroactively moved between sites.

**Frontend (RUM + Session Replay):**

```ts
import { datadogRum } from '@datadog/browser-rum';
import { DatadogProvider } from '@datadog/openfeature-browser';

datadogRum.init({
  applicationId: 'your-application-id',
  clientToken: 'your-client-token',
  site: 'datadoghq.eu',
  service: 'loan-app',
  env: 'production',
  sessionReplaySampleRate: 100,
  defaultPrivacyLevel: 'mask',
});

const provider = new DatadogProvider({
  applicationId: 'your-application-id',
  clientToken: 'your-client-token',
  site: 'datadoghq.eu',   // must match RUM init
  env: 'production',
});
```

**Backend (APM + Metrics):**

```bash
DD_SITE=datadoghq.eu
DD_API_KEY=your-eu-api-key
```

```ts
import tracer from 'dd-trace';

tracer.init({
  service: 'loan-api',
  env: 'production',
  // dd-trace reads DD_SITE from the environment
});
```

**Datadog Agent:**

```yaml
# datadog.yaml
site: datadoghq.eu
api_key: your-eu-api-key
```

## Session Replay and PII

Session Replay requires extra attention in a fintech context. The loan application collects sensitive fields: income, social security numbers, account numbers. These must be masked before the replay is transmitted.

With `defaultPrivacyLevel: 'mask'`, all input fields are masked in replays. Selectively unmask non-sensitive UI elements:

```html
<button data-dd-privacy="allow">Submit Application</button>
<p data-dd-privacy="allow">Step 3 of 8</p>
<input data-dd-privacy="mask" type="text" name="ssn" />
```

This gives you usable replays for UX debugging without transmitting raw PII.

## Third-party vendor data boundary

The credit scoring vendor processes user data outside your infrastructure. Whether their processing complies with EU data residency requirements is governed by their DPA (Data Processing Agreement). Your Datadog traces capture only the latency and response codes of calls to the vendor, not the content of the request or response. As long as you do not log request payloads containing personal data into APM spans, your observability data stays within compliance boundaries.

## What breaks if this is misconfigured

If the SDK is initialized with `datadoghq.com` instead of `datadoghq.eu`, session data is routed to US infrastructure. There is no error, no warning, and no indication in the UI that data crossed a region boundary. The misconfiguration is silent. Manage the site parameter through environment variables and validate it at deployment, not hardcoded per environment.

## Checklist

- [ ] Datadog org provisioned on `datadoghq.eu`
- [ ] RUM SDK initialized with `site: 'datadoghq.eu'`
- [ ] DatadogProvider initialized with `site: 'datadoghq.eu'`
- [ ] Datadog Agent configured with `site: datadoghq.eu`
- [ ] `DD_SITE=datadoghq.eu` set on all backend services
- [ ] Session Replay set to `defaultPrivacyLevel: 'mask'`
- [ ] Vendor DPA reviewed for EU data processing compliance
