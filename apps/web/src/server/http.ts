import type { ChatError, ConsoleError } from '@nexo/core'
import { currentSession, type Session } from './session'

export const ERROR_MESSAGE: Record<ChatError | ConsoleError | 'unauthorized' | 'forbidden' | 'invalid_body' | 'analyst_in_progress', string> = {
  unauthorized: 'Sua sessão expirou. Entre novamente.',
  forbidden: 'Você não tem acesso a esta área.',
  invalid_body: 'Requisição inválida.',
  conversation_not_found: 'Conversa não encontrada.',
  conversation_closed: 'Esta conversa foi encerrada. Comece uma nova.',
  message_limit_reached: 'Você atingiu o limite de 30 mensagens desta conversa.',
  rate_limited: 'Muitas mensagens em pouco tempo. Aguarde alguns segundos.',
  empty_message: 'Escreva uma mensagem.',
  message_too_long: 'Mensagem muito longa (máximo de 1.000 caracteres).',
  invalid_transition: 'Esta ação não está disponível no estado atual da conversa.',
  not_assigned_analyst: 'Outro analista está atendendo esta conversa.',
  analyst_in_progress: 'Um analista está atendendo sua conversa atual.',
}

const STATUS: Partial<Record<keyof typeof ERROR_MESSAGE, number>> = {
  unauthorized: 401,
  forbidden: 403,
  conversation_not_found: 404,
  rate_limited: 429,
  invalid_transition: 409,
  not_assigned_analyst: 409,
  conversation_closed: 409,
  analyst_in_progress: 409,
  message_limit_reached: 409,
}

export function errorResponse(code: keyof typeof ERROR_MESSAGE): Response {
  return Response.json({ error: code, message: ERROR_MESSAGE[code] }, { status: STATUS[code] ?? 400 })
}

export async function requireSession(role: Session['role']): Promise<Session | Response> {
  const session = await currentSession()
  if (!session) return errorResponse('unauthorized')
  if (session.role !== role) return errorResponse('forbidden')
  return session
}

export async function readJson(request: Request): Promise<unknown> {
  return request.json().catch(() => null)
}
