import { datadogRum } from '@datadog/browser-rum';

// Call once when the user is known — ties all events to a single identity
// enabling retention analysis in Datadog Product Analytics.
export function identifyUser(userId: string, name?: string) {
  datadogRum.setUser({ id: userId, name });
}

// Funnel steps — each call creates a RUM action used to build the funnel in Datadog.
export function trackFunnelStep(
  step: 'landing_viewed' | 'product_viewed' | 'cart_viewed' | 'checkout_viewed' | 'purchase_completed',
  context?: Record<string, unknown>
) {
  datadogRum.addAction(step, context);
}

// User path events — richer context for Sankey / path analysis.
export function trackAction(name: string, context?: Record<string, unknown>) {
  datadogRum.addAction(name, context);
}
