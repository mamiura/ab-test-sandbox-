export const config = {
  datadog: {
    applicationId: import.meta.env.VITE_DD_APPLICATION_ID ?? '',
    clientToken: import.meta.env.VITE_DD_CLIENT_TOKEN ?? '',
    site: import.meta.env.VITE_DD_SITE ?? 'datadoghq.com',
    service: 'ab-test-sandbox',
    env: 'production',
  },
  statsig: {
    clientKey: import.meta.env.VITE_STATSIG_CLIENT_KEY ?? '',
  },
  // The feature flag name used in both providers
  FLAG_NAME: 'checkout_button_variant',
} as const;
