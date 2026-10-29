export type EmployeeInput =
  | { type: 'text'; text: string }
  | { type: 'quick_reply'; label: string; value: string }
  | { type: 'select_ticket'; ticketId: string; label: string }
  | { type: 'draft_action'; draftId: string; action: 'confirm' | 'edit' | 'cancel' }
