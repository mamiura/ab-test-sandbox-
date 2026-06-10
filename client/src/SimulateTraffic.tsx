import { useState } from 'react';
import { datadogRum } from '@datadog/browser-rum';
import { trackFunnelStep, trackAction } from './analytics';

// Drop-off probabilities at each step (realistic e-commerce benchmarks)
const DROP_OFF = {
  product_viewed: 0.0,   // everyone who lands sees the product
  cart_viewed: 0.55,     // 55% drop off before adding to cart
  checkout_viewed: 0.35, // 35% drop off at cart
  purchase_completed: 0.25, // 25% drop off at checkout
};

async function simulateUser(userId: string, variant: 'control' | 'variant') {
  datadogRum.setUser({ id: userId });
  datadogRum.addFeatureFlagEvaluation('checkout_button_variant', variant);

  const ctx = datadogRum.getInternalContext();
  console.log('[Simulate] user:', userId, 'session:', ctx?.session_id, 'rum initialized:', !!ctx);

  trackFunnelStep('landing_viewed', { simulated: true });
  trackFunnelStep('product_viewed', { product_id: 'watch-001', price: 299, simulated: true });

  if (Math.random() < DROP_OFF.cart_viewed) return;
  trackFunnelStep('cart_viewed', { items: 1, total: 299, simulated: true });

  if (Math.random() < DROP_OFF.checkout_viewed) return;
  trackFunnelStep('checkout_viewed', { variant, simulated: true });

  // Variant users complete purchase slightly more often (the experiment hypothesis)
  const checkoutDropOff = variant === 'variant'
    ? DROP_OFF.purchase_completed * 0.7
    : DROP_OFF.purchase_completed;

  if (Math.random() < checkoutDropOff) return;
  trackFunnelStep('purchase_completed', { variant, total: 299, simulated: true });
  trackAction('checkout_clicked', { variant, total: 299, simulated: true });
}

export function SimulateTraffic() {
  const [running, setRunning] = useState(false);
  const [count, setCount] = useState(0);

  async function simulate() {
    setRunning(true);
    setCount(0);
    const total = 1000;
    for (let i = 0; i < total; i++) {
      const userId = `sim-user-${Date.now()}-${i}`;
      const variant = i % 2 === 0 ? 'control' : 'variant';
      await simulateUser(userId, variant);
      setCount(i + 1);
      await new Promise((r) => setTimeout(r, 80));
    }
    setRunning(false);
  }

  return (
    <div className="simulate-traffic">
      <button className="simulate-btn" onClick={simulate} disabled={running}>
        {running ? `Simulating… ${count}/1000 users` : 'Simulate 1000 Users'}
      </button>
      {!running && count === 1000 && (
        <span className="simulate-done">Done — close and reopen the tab to flush events, then refresh the funnel in Datadog.</span>
      )}
    </div>
  );
}
