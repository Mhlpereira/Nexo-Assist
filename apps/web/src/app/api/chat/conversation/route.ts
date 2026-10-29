import { container } from '@/server/container'
import { errorResponse, requireSession } from '@/server/http'

export async function GET() {
  const session = await requireSession('employee')
  if (session instanceof Response) return session
  return Response.json(await container().employeeConversations.getOrStart(session.sub))
}

export async function POST() {
  const session = await requireSession('employee')
  if (session instanceof Response) return session
  const result = await container().employeeConversations.startNew(session.sub)
  return result.ok ? Response.json(result.value) : errorResponse(result.error)
}
