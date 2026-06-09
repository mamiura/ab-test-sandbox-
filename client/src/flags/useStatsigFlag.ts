import { useEffect, useState } from 'react';
import { StatsigClient } from '@statsig/js-client';
import { trackFlagEvaluation } from '../dd';
import { config } from '../config';

type Variant = 'control' | 'variant';

let statsigClient: StatsigClient | null = null;

async function getStatsigClient(userId: string): Promise<StatsigClient> {
  if (!statsigClient) {
    statsigClient = new StatsigClient(config.statsig.clientKey, { userID: userId });
    await statsigClient.initializeAsync();
  }
  return statsigClient;
}

// Approach B: Statsig evaluates the gate, then reports the result into Datadog RUM.
// Statsig is the flag engine; Datadog is the observability layer.
// The bridge is datadogRum.addFeatureFlagEvaluation() — called after each evaluation.
export function useStatsigFlag(userId: string): { variant: Variant; loading: boolean } {
  const [variant, setVariant] = useState<Variant>('control');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getStatsigClient(userId).then((client) => {
      const inVariant = client.checkGate(config.FLAG_NAME);

      // The bridge: push the evaluation into Datadog RUM so sessions
      // are enriched with flag data, just like with native Datadog flags.
      trackFlagEvaluation(config.FLAG_NAME, inVariant);

      setVariant(inVariant ? 'variant' : 'control');
      setLoading(false);
    });
  }, [userId]);

  return { variant, loading };
}
