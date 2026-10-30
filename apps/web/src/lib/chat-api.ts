import type { EmployeeConversation, EmployeeInput, TurnEvent, TurnResult } from '@nexo/core'

export type StreamEvent =
  | TurnEvent
  | { type: 'done'; result: TurnResult }
  | { type: 'error'; error: string; message: string }

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message)
  }
}

async function parseError(response: Response): Promise<ApiError> {
  const body: unknown = await response.json().catch(() => null)
  const message =
    typeof body === 'object' && body !== null && 'message' in body && typeof body.message === 'string'
      ? body.message
      : 'Não foi possível completar a ação. Tente novamente.'
  const code = typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string' ? body.error : 'unknown'
  return new ApiError(message, code, response.status)
}

export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } })
  if (response.status === 401) window.location.assign('/login')
  if (!response.ok) throw await parseError(response)
  return response.json()
}

export const loadConversation = () => requestJson<EmployeeConversation>('/api/chat/conversation')
export const startNewConversation = () => requestJson<EmployeeConversation>('/api/chat/conversation', { method: 'POST' })
export const loadMessagesSince = (conversationId: string, after: string | null) =>
  requestJson<EmployeeConversation>(`/api/chat/conversations/${conversationId}/messages${after ? `?after=${encodeURIComponent(after)}` : ''}`)

export async function sendInput(conversationId: string, input: EmployeeInput, onEvent: (event: StreamEvent) => void): Promise<void> {
  const response = await fetch(`/api/chat/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (response.status === 401) window.location.assign('/login')
  if (!response.ok || !response.body) throw await parseError(response)

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += value
    const frames = buffer.split('\n\n')
    buffer = frames.pop() ?? ''
    for (const frame of frames) {
      const data = frame.replace(/^data: /, '')
      if (data) onEvent(JSON.parse(data))
    }
  }
}

export const logout = async () => {
  await fetch('/api/auth/logout', { method: 'POST' })
  window.location.assign('/login')
}
