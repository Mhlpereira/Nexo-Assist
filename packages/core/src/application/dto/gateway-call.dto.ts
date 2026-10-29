import type { Result } from '../../result'
import type { GatewayError } from './gateway-error.dto'

export interface GatewayCall<T> {
  result: Result<T, GatewayError>
  attempts: number
}
