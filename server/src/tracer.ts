// Must be imported before anything else — dd-trace patches Node.js internals at load time.
import tracer from 'dd-trace';
import { OpenFeature } from '@openfeature/server-sdk';

const agentEnabled = process.env.DD_AGENT_HOST !== undefined;

if (agentEnabled) {
  // Production path: Agent running, flags evaluated locally against Agent-cached config.
  // Flag evaluations auto-correlate with APM traces — no extra instrumentation needed.
  tracer.init({
    service: 'ab-test-sandbox-api',
    env: process.env.DD_ENV ?? 'production',
    experimental: {
      flaggingProvider: { enabled: true },
    },
  });
  OpenFeature.setProvider((tracer as any).openfeature);
} else {
  console.warn('[DD] No Agent detected — using InMemoryProvider fallback for demo.');
}

export { tracer, OpenFeature };
