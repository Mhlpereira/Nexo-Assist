import type { Message, MessageBlock } from '../../domain/message'

export type TurnEvent =
  | { type: 'employee_message'; message: Message }
  | { type: 'action_start'; id: string; label: string }
  | { type: 'action_end'; id: string; status: 'ok' | 'error' | 'blocked' }
  | { type: 'text_delta'; text: string }
  | { type: 'block'; block: MessageBlock }
