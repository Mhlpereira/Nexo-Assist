import type { Impact, Priority, TicketKind } from './ticket'

export interface PriorityInput {
  kind: TicketKind
  impact: Impact
  blocksWork: boolean
  deadlineToday: boolean
}

export interface PriorityDecision {
  priority: Priority
  reason: string
}

export function computePriority({ kind, impact, blocksWork, deadlineToday }: PriorityInput): PriorityDecision {
  if (impact !== 'individual' && blocksWork) {
    const who = impact === 'team' ? 'uma equipe' : 'a empresa'
    return { priority: 'critical', reason: `Algo parado para ${who} → Crítica` }
  }
  if (blocksWork && deadlineToday) {
    return { priority: 'high', reason: 'Impede você de trabalhar e há compromisso hoje → Alta' }
  }
  if (blocksWork) return { priority: 'high', reason: 'Impede você de trabalhar → Alta' }
  if (deadlineToday) return { priority: 'high', reason: 'Há um compromisso em risco hoje → Alta' }
  if (kind === 'REQ') return { priority: 'low', reason: 'Pedido sem urgência → Baixa' }
  return { priority: 'medium', reason: 'Atrapalha, mas há alternativa → Média' }
}
