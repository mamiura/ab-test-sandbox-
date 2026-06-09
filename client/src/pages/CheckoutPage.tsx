import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { trackFunnelStep, trackAction } from '../analytics';
import { useDatadogFlag } from '../flags/useDatadogFlag';
import { ErrorSimulator } from '../ErrorSimulator';

export default function CheckoutPage() {
  const navigate = useNavigate();
  const { variant } = useDatadogFlag();

  useEffect(() => {
    trackFunnelStep('checkout_viewed', { variant });
  }, [variant]);

  const button = variant === 'variant'
    ? { label: 'Complete Purchase', color: '#2e7d32' }
    : { label: 'Buy Now', color: '#1a73e8' };

  function handlePurchase() {
    trackAction('checkout_clicked', { variant, total: 299 });
    trackFunnelStep('purchase_completed', { variant, total: 299 });
    navigate('/confirmation');
  }

  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate('/cart')}>← Back</button>
      <h1>Checkout</h1>
      <div className="checkout-summary">
        <div className="summary-row"><span>The Minimalist Watch</span><span>$299</span></div>
        <div className="summary-row total"><span>Total</span><span>$299</span></div>
      </div>
      <div className="experiment-badge">
        A/B Test — Variant: <strong>{variant}</strong>
      </div>
      <button
        className="cta-btn"
        style={{ backgroundColor: button.color }}
        onClick={handlePurchase}
      >
        {button.label}
      </button>
      <ErrorSimulator variant={variant} provider="datadog" />
    </div>
  );
}
