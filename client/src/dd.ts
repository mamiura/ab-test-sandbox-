import { datadogRum } from '@datadog/browser-rum';
import { config } from './config';

export function initDatadogRum() {
  datadogRum.init({
    applicationId: config.datadog.applicationId,
    clientToken: config.datadog.clientToken,
    site: config.datadog.site,
    service: config.datadog.service,
    env: config.datadog.env,
    sessionSampleRate: 100,
    sessionReplaySampleRate: 100,
    trackUserInteractions: true,
    trackResources: true,
    trackLongTasks: true,
  });
}

// Called by both Datadog native flags and Statsig integration
export function trackFlagEvaluation(flagName: string, value: string | boolean) {
  datadogRum.addFeatureFlagEvaluation(flagName, value);
}

export function trackAction(name: string, context?: Record<string, unknown>) {
  datadogRum.addAction(name, context);
}

export function trackError(error: Error, context?: Record<string, unknown>) {
  datadogRum.addError(error, context);
}
