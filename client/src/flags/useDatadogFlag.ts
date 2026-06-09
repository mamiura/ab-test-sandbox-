import { useStringFlagDetails } from '@openfeature/react-sdk'
import { config } from '../config'

type Variant = 'control' | 'variant'

export function useDatadogFlag(): { variant: Variant; loading: boolean } {
  const details = useStringFlagDetails(config.FLAG_NAME, 'control')
  console.log('[DD Flag details]', details)
  const variant: Variant = details.value === 'control' || details.reason === 'ERROR' ? 'control' : 'variant'
  return { variant, loading: false }
}
