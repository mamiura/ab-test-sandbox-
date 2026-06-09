import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { OpenFeature } from '@openfeature/web-sdk'
import { OpenFeatureProvider } from '@openfeature/react-sdk'
import { DatadogProvider } from '@datadog/openfeature-browser'
import { config } from './config'
import { initDatadogRum } from './dd'
import './index.css'
import App from './App.tsx'

initDatadogRum()

const provider = new DatadogProvider({
  applicationId: config.datadog.applicationId,
  clientToken: config.datadog.clientToken,
  site: config.datadog.site,
  env: config.datadog.env,
})

OpenFeature.setProvider(provider, {
  targetingKey: 'demo-user-004',
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <OpenFeatureProvider>
      <App />
    </OpenFeatureProvider>
  </StrictMode>,
)
