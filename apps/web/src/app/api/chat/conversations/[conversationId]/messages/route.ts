import type { EmployeeInput, TurnEvent } from '@nexo/core'
import { z } from 'zod'
import { container } from '@/server/container'
import { ERROR_MESSAGE, errorResponse, readJson, requireSession } from '@/server/http'

const employeeInputSchema: z.ZodType<EmployeeInput> = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string().max(2000) }),
  z.object({ type: z.literal('quick_reply'), label: z.string().max(200), value: z.string().max(500) }),
  z.object({ type: z.literal('select_ticket'), ticketId: z.string().max(20), label: z.string().max(200) }),
  z.object({ type: z.literal('draft_action'), draftId: z.string().max(20), action: z.enum(['confirm', 'edit', 'cancel']) }),
])

export async function GET(request: Request, context: RouteContext<'/api/chat/conversations/[conversationId]/messages'>) {
  const session = await requireSession('employee')
  if (session instanceof Response) return session
  const { conversationId } = await context.params
  const afterParameter = new URL(request.url).searchParams.get('after')
  const after = afterParameter ? new Date(afterParameter) : null
  const result = await container().employeeConversations.messagesSince(session.sub, conversationId, after && !Number.isNaN(after.getTime()) ? after : null)
  return result.ok ? Response.json(result.value) : errorResponse(result.error)
}

type StreamEvent = TurnEvent | { type: 'done'; result: unknown } | { type: 'error'; error: string; message: string }

export async function POST(request: Request, context: RouteContext<'/api/chat/conversations/[conversationId]/messages'>) {
  const session = await requireSession('employee')
  if (session instanceof Response) return session
  const parsed = employeeInputSchema.safeParse(await readJson(request))
  if (!parsed.success) return errorResponse('invalid_body')
  const { conversationId } = await context.params
  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: StreamEvent) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      try {
        const result = await container().handleEmployeeInput.execute(
          { employeeId: session.sub, conversationId, input: parsed.data },
          { emit: send },
        )
        send(result.ok ? { type: 'done', result: result.value } : { type: 'error', error: result.error, message: ERROR_MESSAGE[result.error] })
      } catch (error) {
        console.error('Falha no turno do agent', error)
        send({ type: 'error', error: 'internal', message: 'Algo deu errado do nosso lado. Tente novamente.' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive' },
  })
}
