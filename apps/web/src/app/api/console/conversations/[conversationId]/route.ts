import { container } from '@/server/container'
import { errorResponse, requireSession } from '@/server/http'

export async function GET(_request: Request, context: RouteContext<'/api/console/conversations/[conversationId]'>) {
  const session = await requireSession('analyst')
  if (session instanceof Response) return session
  const { conversationId } = await context.params
  const result = await container().analystConsole.detail(session.sub, conversationId)
  return result.ok ? Response.json(result.value) : errorResponse(result.error)
}
