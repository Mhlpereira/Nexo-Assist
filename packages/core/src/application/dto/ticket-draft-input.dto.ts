import type { Category, Impact, TicketKind } from '../../domain/ticket'

export interface TicketDraftInput {
  title: string
  description: string
  kind: TicketKind
  category: Category
  impact: Impact
  blocksWork: boolean
  deadlineToday: boolean
}
