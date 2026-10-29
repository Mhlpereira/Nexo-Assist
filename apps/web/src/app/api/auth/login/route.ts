import { z } from 'zod'
import { container } from '@/server/container'
import { errorResponse, readJson } from '@/server/http'
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from '@/server/session'
import { cookies } from 'next/headers'

const loginSchema = z.object({ email: z.string().min(3).max(200), password: z.string().max(200) })

export async function POST(request: Request) {
  const parsed = loginSchema.safeParse(await readJson(request))
  if (!parsed.success) return errorResponse('invalid_body')
  const result = await container().login.execute(parsed.data.email, parsed.data.password)
  if (!result.ok) return Response.json({ error: result.error, message: 'E-mail ou senha inválidos.' }, { status: 401 })
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, await createSessionToken(result.value), sessionCookieOptions)
  return Response.json({ role: result.value.role, redirectTo: result.value.role === 'analyst' ? '/console' : '/chat' })
}
