import type { HistoryEntry } from './history-entry.dto'

export interface InterpretRequest {
  employeeName: string
  history: HistoryEntry[]
  text: string
  stateSummary: string
}
