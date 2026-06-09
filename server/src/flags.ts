import { OpenFeature, InMemoryProvider } from '@openfeature/server-sdk';

const FLAG_NAME = 'checkout_button_variant';

// Fallback provider for local demo without a Datadog Agent.
// In production this is replaced by tracer.openfeature (see tracer.ts).
export async function initFallbackProvider(rolloutPercent = 50) {
  await OpenFeature.setProviderAndWait(
    new InMemoryProvider({
      [FLAG_NAME]: {
        disabled: false,
        defaultVariant: 'control',
        variants: { control: 'control', variant: 'variant' },
        // Simulate a percentage rollout by hashing the targetingKey.
        // The real Datadog provider does this server-side via the Agent.
        contextEvaluator: (ctx) => {
          const key = String(ctx.targetingKey ?? 'anonymous');
          const hash = [...key].reduce((acc, c) => acc + c.charCodeAt(0), 0);
          return hash % 100 < rolloutPercent ? 'variant' : 'control';
        },
      },
    })
  );
}

export async function evaluateFlag(userId: string): Promise<'control' | 'variant'> {
  const client = OpenFeature.getClient();
  const value = await client.getStringValue(FLAG_NAME, 'control', {
    targetingKey: userId,
  });
  return value === 'variant' ? 'variant' : 'control';
}
