import { z } from 'zod'
import { container } from '@/server/container'
import { errorResponse, readJson, requireSession } from '@/server/http'

const messageSchema = z.object({ text: z.string().min(1).max(2000) })

export async function POST(request: Request, context: RouteContext<'/api/console/conversations/[conversationId]/[action]'>) {
  const session = await requireSession('analyst')
  if (session instanceof Response) return session
  const { conversationId, action } = await context.params
  const analystConsole = container().analystConsole

  const run = async () => {
    switch (action) {
      case 'take-over':
        return analystConsole.takeOver(session.sub, conversationId)
      case 'return-to-agent':
        return analystConsole.returnToAgent(session.sub, conversationId)
      case 'close':
        return analystConsole.close(session.sub, conversationId)
      case 'messages': {
        const parsed = messageSchema.safeParse(await readJson(request))
        return parsed.success ? analystConsole.sendMessage(session.sub, conversationId, parsed.data.text) : null
      }
      default:
        return null
    }
  }

  const result = await run()
  if (!result) return errorResponse('invalid_body')
  return result.ok ? Response.json({ ok: true }) : errorResponse(result.error)
}
