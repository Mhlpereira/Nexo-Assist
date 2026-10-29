import type { TicketDraftInput } from '../../dto/ticket-draft-input.dto'

export interface TurnTools {
  searchHelpCenter(input: { query: string }): Promise<unknown>
  listMyTickets(): Promise<unknown>
  getTicket(input: { ticketId: string }): Promise<unknown>
  askOptions(input: { options: string[] }): Promise<unknown>
  prepareTicketDraft(input: TicketDraftInput): Promise<unknown>
  prepareUpdateDraft(input: { ticketId: string; text: string }): Promise<unknown>
}
