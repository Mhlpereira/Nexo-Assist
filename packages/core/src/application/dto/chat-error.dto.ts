export type ChatError =
  | 'conversation_not_found'
  | 'conversation_closed'
  | 'message_limit_reached'
  | 'rate_limited'
  | 'empty_message'
  | 'message_too_long'
