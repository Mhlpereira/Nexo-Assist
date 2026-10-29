import type { EmployeeInput } from './employee-input.dto'

export interface HandleEmployeeInputCommand {
  employeeId: string
  conversationId: string
  input: EmployeeInput
}
