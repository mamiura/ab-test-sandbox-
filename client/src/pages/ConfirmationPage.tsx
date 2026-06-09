import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { trackAction } from '../analytics';

export default function ConfirmationPage() {
  const navigate = useNavigate();

  useEffect(() => {
    trackAction('order_confirmed', { product_id: 'watch-001', total: 299 });
  }, []);

  return (
    <div className="page confirmation-page">
      <div className="confirmation-icon">✓</div>
      <h1>Order Confirmed!</h1>
      <p>Your Minimalist Watch is on its way.</p>
      <p className="order-number">Order #MW-{Math.floor(Math.random() * 90000) + 10000}</p>
      <button
        className="cta-btn"
        onClick={() => {
          trackAction('shop_again_clicked');
          navigate('/');
        }}
      >
        Shop Again
      </button>
    </div>
  );
}
