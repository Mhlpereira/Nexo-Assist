import { z } from 'zod'

export const environment = z
  .object({
    DATABASE_URL: z.string().url(),
    TICKETS_SERVICE_TOKEN: z.string().min(8),
    TICKETS_SERVICE_PORT: z.coerce.number().default(4001),
    CHAOS_FAILURE_RATE: z.coerce.number().min(0).max(1).default(0.15),
    CHAOS_LATENCY_MS: z.coerce.number().min(0).default(300),
  })
  .parse(process.env)
