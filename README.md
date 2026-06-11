# A/B Test Sandbox

Companion code for the blog post series on safe feature rollouts and product analytics with Datadog.

Demonstrates:
- **A/B testing** with Datadog Native Feature Flags
- **Product Analytics** funnel tracking across a 5-step e-commerce flow
- **Error simulation** with kill switch pattern
- **Session Replay** correlated with flag variants
- **Server-side flag evaluation** with dd-trace and APM

## Architecture

```
client/   React + Vite — browser-side flag evaluation, RUM, funnel tracking
server/   Node.js + Express — server-side flag evaluation with dd-trace + APM
```

## Quick Start

### Client

```bash
cd client
cp .env.example .env
npm install
npm run dev
```

Open `http://localhost:5173`

### Server

```bash
cd server
DD_AGENT_HOST=localhost DD_METRICS_OTEL_ENABLED=true npm run dev
```

## Environment Variables

### Client (`client/.env`)

| Variable | Where to find it |
|---|---|
| `VITE_DD_APPLICATION_ID` | Datadog > UX Monitoring > RUM Applications > New Application |
| `VITE_DD_CLIENT_TOKEN` | Same RUM application setup flow |
| `VITE_DD_SITE` | `datadoghq.com` (or `datadoghq.eu` for EU) |

## Datadog Setup

### Feature Flag
1. Go to **Software Delivery > Feature Flags > New Flag**
2. Name: `checkout_button_variant`
3. Type: String
4. Variations: `control` (value: `control`), `variant` (value: `variant`)
5. Add a 50% rollout targeting rule and enable the flag for `production`

### Experiment Metrics
In the feature flag **Experiments** tab, add:
- **Failure metric** — RUM Errors filtered by `@error.type:CheckoutError`
- **Conversion metric** — RUM Action `checkout_clicked`

### Product Analytics Funnel
In **Product Analytics > Funnels**, create a funnel with these RUM actions in order:
1. `landing_viewed`
2. `product_viewed`
3. `cart_viewed`
4. `checkout_viewed`
5. `purchase_completed`

Break down by `@feature_flags.checkout_button_variant` to compare drop-off between control and variant across the full journey.

### Server-side APM (optional)
Requires Datadog Agent 7.55+ with Remote Configuration enabled.
- Enable Remote Configuration: **Organization Settings > Remote Configuration**
- Add **Remote Configuration Read** permission to your Agent's API key

## What's in the sandbox

| Feature | Where |
|---|---|
| Flag evaluation (browser) | `client/src/flags/useDatadogFlag.ts` |
| RUM init + error/action tracking | `client/src/dd.ts` |
| Funnel step tracking | `client/src/analytics.ts` |
| E-commerce funnel pages | `client/src/pages/` |
| Error simulator + kill switch | `client/src/ErrorSimulator.tsx` |
| User switcher (simulate different users) | `client/src/UserSwitcher.tsx` |
| Traffic simulator (bulk funnel events) | `client/src/SimulateTraffic.tsx` |
| Server-side flag evaluation | `server/src/flags.ts` |
| APM tracing setup | `server/src/tracer.ts` |

## Blog Posts

- `BLOG_POST.md` — How to run your first A/B test without breaking production
- `BLOG_POST_FF_STRATEGIES.md` — Feature flag strategies: frontend vs backend, continuous rollout, and experimentation
