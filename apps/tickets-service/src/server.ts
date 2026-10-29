import { serve } from '@hono/node-server'
import { createApp } from './app'
import { connect } from './database'
import { environment } from './environment'

const app = createApp({
  sql: connect(environment.DATABASE_URL),
  serviceToken: environment.TICKETS_SERVICE_TOKEN,
  chaos: { failureRate: environment.CHAOS_FAILURE_RATE, latencyMilliseconds: environment.CHAOS_LATENCY_MS },
})

serve({ fetch: app.fetch, port: environment.TICKETS_SERVICE_PORT }, ({ port }) => {
  console.log(`tickets-service em http://localhost:${port} (falha simulada ${environment.CHAOS_FAILURE_RATE * 100}%)`)
})
