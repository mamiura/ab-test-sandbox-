import './tracer'; // must be first — initializes dd-trace and OpenFeature at module level
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { evaluateFlag, initFallbackProvider } from './flags';

// Runs once per cold start — not re-executed on warm invocations.
const ready: Promise<void> = (async () => {
  if (process.env.USE_FALLBACK === 'true') {
    await initFallbackProvider();
  }
})();

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  await ready;

  // Prefer authenticated user ID from the authorizer context.
  // Fall back to a query param for unauthenticated requests.
  // Never use a random value — the same user must always get the same variant.
  const userId =
    (event.requestContext?.authorizer?.userId as string) ??
    event.queryStringParameters?.userId ??
    'anonymous';

  const variant = await evaluateFlag(userId);

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId,
      flag: 'checkout_button_variant',
      variant,
    }),
  };
}
