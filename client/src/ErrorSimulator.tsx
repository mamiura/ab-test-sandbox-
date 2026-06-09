import { useState } from 'react';
import { trackError } from './dd';

const ERRORS = [
  'Payment gateway timeout',
  'Cart total mismatch',
  'Checkout session expired',
  'Price validation failed',
];

interface Props {
  variant: 'control' | 'variant';
  provider: 'datadog' | 'statsig';
}

export function ErrorSimulator({ variant, provider }: Props) {
  const [count, setCount] = useState(0);

  function simulateError() {
    const message = ERRORS[count % ERRORS.length];
    // Create the error here so the stack trace points to the checkout flow
    const error = new Error(message);
    error.name = 'CheckoutError';
    trackError(error, { variant, provider, errorIndex: count });
    setCount((c) => c + 1);
  }

  return (
    <div className="error-simulator">
      <div className="error-header">
        <span>Error Simulator</span>
        {count > 0 && (
          <span className="error-count">{count} error{count !== 1 ? 's' : ''} fired</span>
        )}
      </div>
      <p className="error-hint">
        Fires a <code>datadogRum.addError()</code> tagged with the current variant.
        In Datadog, filter RUM errors by <code>@feature_flags.{'{'}checkout_button_variant{'}'}</code> to
        see the error rate split by variant.
      </p>
      <button className="error-btn" onClick={simulateError}>
        Simulate Error
      </button>
      {count >= 3 && (
        <p className="kill-switch-hint">
          High error rate detected — this is when you'd flip the flag back to <strong>control</strong> (your kill switch).
        </p>
      )}
    </div>
  );
}
