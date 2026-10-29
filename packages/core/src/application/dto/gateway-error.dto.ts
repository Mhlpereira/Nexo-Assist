export type GatewayError =
  | { kind: 'unavailable'; attempts: number }
  | { kind: 'not_found' }
  | { kind: 'rejected'; reason: string }
