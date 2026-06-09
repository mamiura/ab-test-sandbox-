import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { trackFunnelStep, trackAction } from '../analytics';

export default function LandingPage() {
  const navigate = useNavigate();

  useEffect(() => {
    trackFunnelStep('landing_viewed');
  }, []);

  return (
    <div className="page">
      <div className="hero-section">
        <h1>The Minimalist Watch</h1>
        <p className="tagline">Precision. Simplicity. Yours.</p>
        <div className="hero-product">
          <div className="product-placeholder">⌚</div>
        </div>
        <button
          className="cta-btn"
          onClick={() => {
            trackAction('cta_clicked', { location: 'hero' });
            navigate('/product');
          }}
        >
          Shop Now
        </button>
        <button
          className="secondary-btn"
          onClick={() => {
            trackAction('learn_more_clicked');
            navigate('/product');
          }}
        >
          Learn More
        </button>
      </div>

      <div className="features">
        {['Swiss Movement', '5-Year Warranty', 'Free Returns'].map((f) => (
          <div key={f} className="feature-chip">{f}</div>
        ))}
      </div>
    </div>
  );
}
