import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { trackFunnelStep, trackAction } from '../analytics';

export default function ProductPage() {
  const navigate = useNavigate();

  useEffect(() => {
    trackFunnelStep('product_viewed', { product_id: 'watch-001', price: 299 });
  }, []);

  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate('/')}>← Back</button>
      <div className="product-detail">
        <div className="product-image">⌚</div>
        <div className="product-info">
          <h1>The Minimalist Watch</h1>
          <p className="price">$299</p>
          <p className="description">
            Hand-assembled with a Swiss movement and sapphire crystal glass.
            Water resistant to 50m. Available in silver and black.
          </p>
          <div className="variants">
            {['Silver', 'Black'].map((color) => (
              <button
                key={color}
                className="variant-btn"
                onClick={() => trackAction('color_selected', { color })}
              >
                {color}
              </button>
            ))}
          </div>
          <button
            className="cta-btn"
            onClick={() => {
              trackAction('add_to_cart_clicked', { product_id: 'watch-001', price: 299 });
              navigate('/cart');
            }}
          >
            Add to Cart
          </button>
        </div>
      </div>
    </div>
  );
}
