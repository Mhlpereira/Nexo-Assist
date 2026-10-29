import { NextResponse, type NextRequest } from 'next/server'
import { readSessionToken, SESSION_COOKIE } from './server/session'

const HOME_BY_ROLE = { employee: '/chat', analyst: '/console' } as const

export async function proxy(request: NextRequest) {
  const session = await readSessionToken(request.cookies.get(SESSION_COOKIE)?.value)
  const { pathname } = request.nextUrl

  const redirectTo = (path: string) => NextResponse.redirect(new URL(path, request.url))

  if (pathname === '/') return redirectTo(session ? HOME_BY_ROLE[session.role] : '/login')
  if (pathname === '/login') return session ? redirectTo(HOME_BY_ROLE[session.role]) : NextResponse.next()
  if (!session) return redirectTo('/login')
  const isConsole = pathname.startsWith('/console')
  if (isConsole !== (session.role === 'analyst')) return redirectTo(HOME_BY_ROLE[session.role])
  return NextResponse.next()
}

export const config = {
  matcher: ['/', '/login', '/chat/:path*', '/perfil/:path*', '/console/:path*'],
}
