import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { trackFunnelStep, trackAction } from '../analytics';

export default function CartPage() {
  const navigate = useNavigate();

  useEffect(() => {
    trackFunnelStep('cart_viewed', { items: 1, total: 299 });
  }, []);

  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate('/product')}>← Back</button>
      <h1>Your Cart</h1>
      <div className="cart-item">
        <div className="cart-item-emoji">⌚</div>
        <div className="cart-item-info">
          <p className="cart-item-name">The Minimalist Watch</p>
          <p className="cart-item-meta">Silver · Qty: 1</p>
        </div>
        <p className="cart-item-price">$299</p>
      </div>
      <div className="cart-summary">
        <div className="summary-row"><span>Subtotal</span><span>$299</span></div>
        <div className="summary-row"><span>Shipping</span><span>Free</span></div>
        <div className="summary-row total"><span>Total</span><span>$299</span></div>
      </div>
      <button
        className="cta-btn"
        onClick={() => {
          trackAction('proceed_to_checkout_clicked', { total: 299 });
          navigate('/checkout');
        }}
      >
        Proceed to Checkout
      </button>
      <button
        className="secondary-btn"
        onClick={() => {
          trackAction('continue_shopping_clicked');
          navigate('/product');
        }}
      >
        Continue Shopping
      </button>
    </div>
  );
}
