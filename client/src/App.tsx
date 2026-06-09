import { useState } from 'react';
import { useDatadogFlag } from './flags/useDatadogFlag';
import { useStatsigFlag } from './flags/useStatsigFlag';
import { CheckoutButton } from './CheckoutButton';
import { ErrorSimulator } from './ErrorSimulator';
import './App.css';

const USER_ID = 'demo-user-001';

type Provider = 'datadog' | 'statsig';

function DatadogExperiment() {
  const { variant, loading } = useDatadogFlag();
  if (loading) return <p className="loading">Evaluating flag…</p>;
  return (
    <div className="experiment-card">
      <h2>Approach A — Datadog Native Feature Flags</h2>
      <p className="subtitle">
        Flag managed in Datadog. RUM automatically correlates the evaluation with
        performance metrics, errors, and session replays.
      </p>
      <div className="badge">Variant: <strong>{variant}</strong></div>
      <CheckoutButton variant={variant} provider="datadog" />
      <ErrorSimulator variant={variant} provider="datadog" />
    </div>
  );
}

function StatsigExperiment() {
  const { variant, loading } = useStatsigFlag(USER_ID);
  if (loading) return <p className="loading">Evaluating flag…</p>;
  return (
    <div className="experiment-card">
      <h2>Approach B — Statsig + Datadog RUM</h2>
      <p className="subtitle">
        Statsig evaluates the gate. A single{' '}
        <code>datadogRum.addFeatureFlagEvaluation()</code> call bridges the
        result into Datadog so sessions are enriched identically to Approach A.
      </p>
      <div className="badge">Variant: <strong>{variant}</strong></div>
      <CheckoutButton variant={variant} provider="statsig" />
      <ErrorSimulator variant={variant} provider="statsig" />
    </div>
  );
}

export default function App() {
  const [provider, setProvider] = useState<Provider>('datadog');

  return (
    <div className="app">
      <header className="app-header">
        <h1>A/B Test Sandbox</h1>
        <p>Checkout button experiment — two ways to run it safely</p>
        <div className="toggle-bar">
          <button
            className={provider === 'datadog' ? 'active' : ''}
            onClick={() => setProvider('datadog')}
          >
            Datadog Native
          </button>
          <button
            className={provider === 'statsig' ? 'active' : ''}
            onClick={() => setProvider('statsig')}
          >
            Statsig + Datadog RUM
          </button>
        </div>
      </header>

      <main className="app-main">
        {provider === 'datadog' ? <DatadogExperiment /> : <StatsigExperiment />}
      </main>

      <footer className="app-footer">
        <p>
          Click the button to fire a <code>checkout_clicked</code> RUM action —
          visible in your Datadog dashboard under RUM &gt; Events.
        </p>
      </footer>
    </div>
  );
}
