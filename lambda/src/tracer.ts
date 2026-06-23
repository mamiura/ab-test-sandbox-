// Must be the very first import — dd-trace patches Node.js internals at load time.
// In Lambda this runs once per cold start and is cached across warm invocations.
import tracer from 'dd-trace';
import { OpenFeature } from '@openfeature/server-sdk';

const useFallback = process.env.USE_FALLBACK === 'true';

if (!useFallback) {
  // Production path: Datadog Lambda Extension running as a layer.
  // The extension handles Remote Configuration and ships traces to Datadog.
  tracer.init({
    service: process.env.DD_SERVICE ?? 'ab-test-sandbox-lambda',
    env: process.env.DD_ENV ?? 'production',
    experimental: {
      flaggingProvider: { enabled: true },
    },
  });
  OpenFeature.setProvider((tracer as any).openfeature);
} else {
  console.warn('[DD] USE_FALLBACK=true — using InMemoryProvider for local testing.');
}

export { tracer, OpenFeature };
