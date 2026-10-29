import type { User } from '@nexo/core'
import { jwtVerify, SignJWT } from 'jose'
import { cookies } from 'next/headers'
import { z } from 'zod'

export const SESSION_COOKIE = 'nexo_session'
const SESSION_HOURS = 8

const sessionSchema = z.object({
  sub: z.string(),
  role: z.enum(['employee', 'analyst']),
  name: z.string(),
  email: z.string(),
})

export type Session = z.infer<typeof sessionSchema>

const secretKey = () => new TextEncoder().encode(process.env.SESSION_SECRET ?? '')

export async function createSessionToken(user: User): Promise<string> {
  return new SignJWT({ role: user.role, name: user.name, email: user.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(secretKey())
}

export async function readSessionToken(token: string | undefined): Promise<Session | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, secretKey())
    const parsed = sessionSchema.safeParse(payload)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export async function currentSession(): Promise<Session | null> {
  return readSessionToken((await cookies()).get(SESSION_COOKIE)?.value)
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: SESSION_HOURS * 60 * 60,
}
