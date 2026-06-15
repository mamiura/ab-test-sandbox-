import { useState } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import ProductPage from './pages/ProductPage';
import CartPage from './pages/CartPage';
import CheckoutPage from './pages/CheckoutPage';
import ConfirmationPage from './pages/ConfirmationPage';
import { UserSwitcher } from './UserSwitcher';
import { SimulateTraffic } from './SimulateTraffic';
import './App.css';

const STEPS = ['/', '/product', '/cart', '/checkout', '/confirmation'];
const LABELS = ['Landing', 'Product', 'Cart', 'Checkout', 'Confirmation'];

function FunnelNav() {
  const { pathname } = useLocation();
  const current = STEPS.indexOf(pathname);
  return (
    <nav className="funnel-nav">
      {STEPS.map((step, i) => (
        <div key={step} className={`funnel-step ${i === current ? 'active' : ''} ${i < current ? 'done' : ''}`}>
          <div className="funnel-dot" />
          <span>{LABELS[i]}</span>
        </div>
      ))}
    </nav>
  );
}

export default function App() {
  const [currentUserId, setCurrentUserId] = useState('user-001');
  const navigate = useNavigate();

  function handleUserChange(userId: string) {
    setCurrentUserId(userId);
    navigate('/'); // restart funnel from landing for the new user
  }

  return (
    <div className="app">
      <FunnelNav />
      <UserSwitcher currentUserId={currentUserId} onChange={handleUserChange} />
      <SimulateTraffic />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/product" element={<ProductPage />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/confirmation" element={<ConfirmationPage />} />
        </Routes>
      </main>
    </div>
  );
}
