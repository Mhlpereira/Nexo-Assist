import type { Interpretation } from '../../domain/interpretation'
import type { ToolName } from '../../domain/policy'
import type { HistoryEntry } from './history-entry.dto'

export interface RespondRequest {
  employeeName: string
  history: HistoryEntry[]
  text: string
  interpretation: Interpretation
  mode: 'respond' | 'clarify'
  allowedTools: ToolName[]
  stateSummary: string
  now: Date
}
