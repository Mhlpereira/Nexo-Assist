import type { TurnEvent } from '../../dto/turn-event.dto'

export interface TurnEventSink {
  emit(event: TurnEvent): void
}
