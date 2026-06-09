# A/B Test Sandbox

Companion code for the blog post: *"How to run your first A/B test without breaking production"*

Demonstrates two approaches to safe feature flag rollouts:
- **Approach A** — Datadog Native Feature Flags
- **Approach B** — Statsig + Datadog RUM integration

## Setup

```bash
cd client
cp .env.example .env
```

Fill in `.env`:

| Variable | Where to find it |
|---|---|
| `VITE_DD_APPLICATION_ID` | Datadog → UX Monitoring → RUM Applications → New Application |
| `VITE_DD_CLIENT_TOKEN` | Same RUM application setup flow |
| `VITE_DD_SITE` | `datadoghq.com` (or `datadoghq.eu` for EU) |
| `VITE_STATSIG_CLIENT_KEY` | Statsig → Project Settings → API Keys → Client SDK Key |

## Feature Flag Setup

### Approach A — Datadog
1. Go to **Software Delivery → Feature Flags → New Flag**
2. Name it `checkout_button_variant`
3. Add a percentage rollout rule (e.g. 50% → `variant`)

### Approach B — Statsig
1. Go to **Statsig Console → Feature Gates → Create New**
2. Name it `checkout_button_variant`
3. Add a targeting rule with 50% pass rate

## Run

```bash
cd client
npm install
npm run dev
```

Open `http://localhost:5173` — toggle between the two approaches in the header.
Each button click fires a `checkout_clicked` RUM action visible in **Datadog → RUM → Events**.
