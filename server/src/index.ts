import './tracer'; // must be first
import express from 'express';
import cors from 'cors';
import { evaluateFlag, initFallbackProvider } from './flags';

const app = express();
app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

// GET /api/variant?userId=demo-user-001
// Returns the flag variant for the given user.
// In production, dd-trace attaches the evaluation to the current APM span automatically.
app.get('/api/variant', async (req, res) => {
  const userId = String(req.query.userId ?? 'anonymous');
  const variant = await evaluateFlag(userId);

  res.json({ userId, flag: 'checkout_button_variant', variant });
});

// POST /api/checkout
// Simulates a checkout — evaluates the flag server-side and returns the button config.
// This is the server-side pattern: sensitive targeting rules stay out of the browser.
app.post('/api/checkout', async (req, res) => {
  const { userId, action } = req.body as { userId: string; action: string };
  const variant = await evaluateFlag(userId);

  const buttonConfig = {
    control: { label: 'Buy Now', color: '#1a73e8' },
    variant: { label: 'Complete Purchase', color: '#2e7d32' },
  }[variant];

  // Simulate occasional checkout errors in the variant to mirror the frontend demo
  if (variant === 'variant' && Math.random() < 0.2) {
    return res.status(500).json({
      error: 'CheckoutError',
      message: 'Payment gateway timeout',
      variant,
    });
  }

  res.json({ userId, action, variant, buttonConfig, success: true });
});

async function start() {
  const agentRunning = process.env.DD_AGENT_HOST !== undefined;
  if (!agentRunning) {
    await initFallbackProvider();
  }

  const port = process.env.PORT ?? 3001;
  app.listen(port, () => {
    console.log(`API running on http://localhost:${port}`);
    console.log(`Flag provider: ${agentRunning ? 'Datadog Agent (APM-correlated)' : 'InMemory fallback (demo mode)'}`);
  });
}

start();
