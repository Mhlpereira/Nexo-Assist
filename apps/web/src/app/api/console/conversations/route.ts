import { z } from 'zod'
import { container } from '@/server/container'
import { requireSession } from '@/server/http'

const filterSchema = z.enum(['all', 'for_you', 'with_agent', 'mine']).catch('all')

export async function GET(request: Request) {
  const session = await requireSession('analyst')
  if (session instanceof Response) return session
  const parameters = new URL(request.url).searchParams
  const filter = filterSchema.parse(parameters.get('filter'))
  const search = (parameters.get('search') ?? '').slice(0, 100)
  return Response.json(await container().analystConsole.list(session.sub, filter, search))
}
