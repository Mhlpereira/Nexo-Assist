import type { NewTicket, Ticket } from '../../../domain/ticket'
import type { GatewayCall } from '../../dto/gateway-call.dto'

export interface TicketGateway {
  listByEmployee(employeeId: string): Promise<GatewayCall<Ticket[]>>
  get(employeeId: string, ticketId: string): Promise<GatewayCall<Ticket>>
  create(employeeId: string, ticket: NewTicket, idempotencyKey: string): Promise<GatewayCall<Ticket>>
  addUpdate(employeeId: string, ticketId: string, text: string, idempotencyKey: string): Promise<GatewayCall<Ticket>>
  reopen(employeeId: string, ticketId: string, reason: string, idempotencyKey: string): Promise<GatewayCall<Ticket>>
  transfer(employeeId: string, ticketId: string, summary: string, idempotencyKey: string): Promise<GatewayCall<Ticket>>
}
