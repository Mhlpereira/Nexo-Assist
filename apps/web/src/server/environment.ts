import { z } from 'zod'

export const environment = z
  .object({
    DATABASE_URL: z.string().url(),
    SESSION_SECRET: z.string().min(32, 'SESSION_SECRET precisa de pelo menos 32 caracteres'),
    TICKETS_SERVICE_URL: z.string().url(),
    TICKETS_SERVICE_TOKEN: z.string().min(8),
    LLM_MODEL: z.string().default('google/gemini-flash-latest'),
    OLLAMA_BASE_URL: z.string().url().default('http://localhost:11434'),
    LLM_DAILY_BUDGET: z.coerce.number().int().positive().default(500),
  })
  .parse(process.env)
