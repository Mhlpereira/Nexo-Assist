'use client'

import type { DecisionTrace, Draft, MessageBlock, QuickReply, TicketView } from '@nexo/core'
import { AlertTriangle, Ban, Check, Loader2, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { DraftCard } from './draft-card'
import { QuickReplies } from './quick-replies'
import { TicketCard } from './ticket-card'
import { TicketSelector } from './ticket-selector'
import { TracePanel } from './trace-panel'

export interface LiveAction {
  id: string
  label: string
  status: 'running' | 'ok' | 'error' | 'blocked'
}

export interface AgentMessageInteraction {
  interactive: boolean
  busy: boolean
  pendingDraftId: string | null
  chosenText: string | null
  onQuickReply: (option: QuickReply) => void
  onSelectTicket: (ticket: TicketView) => void
  onDraftAction: (draft: Draft, action: 'confirm' | 'edit' | 'cancel') => void
}

interface AgentMessageProps {
  authorName: string
  blocks: MessageBlock[]
  actions: LiveAction[]
  trace: DecisionTrace | null
  streaming?: boolean
  showModel?: boolean
  interaction: AgentMessageInteraction
}

const STATUS_ICON = {
  running: <Loader2 size={12} className="animate-spin text-ink-3" />,
  ok: <Check size={12} className="text-ink-3" />,
  error: <AlertTriangle size={12} className="text-danger-text" />,
  blocked: <Ban size={12} className="text-warning-text" />,
}

type Group = { kind: 'bubble'; blocks: MessageBlock[] } | { kind: 'card'; block: MessageBlock }

function groupBlocks(blocks: MessageBlock[]): Group[] {
  const groups: Group[] = []
  for (const block of blocks) {
    const last = groups.at(-1)
    if (block.kind === 'text' || block.kind === 'quick_replies') {
      if (last?.kind === 'bubble') last.blocks.push(block)
      else groups.push({ kind: 'bubble', blocks: [block] })
    } else {
      groups.push({ kind: 'card', block })
    }
  }
  return groups
}

export const actionsFromTrace = (trace: DecisionTrace | null): LiveAction[] =>
  (trace?.actions ?? [])
    .filter((action) => action.tool !== 'ask_options')
    .map((action, index) => ({ id: `${index}`, label: action.label, status: action.status }))

export function AgentMessage({ authorName, blocks, actions, trace, streaming = false, showModel = false, interaction }: AgentMessageProps) {
  const [traceOpen, setTraceOpen] = useState(false)
  const visibleActions = actions.filter((action) => action.label)
  const groups = groupBlocks(blocks)

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
        <span className="font-semibold text-ink">{authorName}</span>
        {visibleActions.map((action) => (
          <span key={action.id} className="flex items-center gap-[5px] text-ink-3">
            {STATUS_ICON[action.status]}
            {action.label}
          </span>
        ))}
        {streaming && visibleActions.length === 0 && (
          <span className="flex items-center gap-1.5 text-ink-3">
            <Loader2 size={12} className="animate-spin" /> pensando…
          </span>
        )}
        {trace && (
          <button
            type="button"
            onClick={() => setTraceOpen((open) => !open)}
            aria-expanded={traceOpen}
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-primary-text transition hover:bg-primary-soft"
          >
            <Sparkles size={12} />
            {traceOpen ? 'Ocultar detalhes' : 'Por quê?'}
          </button>
        )}
      </div>

      {traceOpen && trace && <TracePanel trace={trace} showModel={showModel} />}

      {groups.map((group, index) =>
        group.kind === 'bubble' ? (
          <div key={index} className="flex max-w-[600px] flex-col gap-3 rounded-[4px_12px_12px_12px] border border-rule bg-paper px-4 py-3">
            {group.blocks.map((block, blockIndex) =>
              block.kind === 'text' ? (
                <p key={blockIndex} className="text-[14.5px] leading-[1.5] whitespace-pre-line text-ink">
                  {block.text}
                  {streaming && blockIndex === group.blocks.length - 1 && <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-ink/50 align-middle" />}
                </p>
              ) : block.kind === 'quick_replies' ? (
                <QuickReplies
                  key={blockIndex}
                  options={block.options}
                  chosen={interaction.chosenText}
                  disabled={!interaction.interactive || interaction.busy}
                  onChoose={interaction.onQuickReply}
                />
              ) : null,
            )}
          </div>
        ) : (
          <div key={index} className="max-w-[640px]">
            {group.block.kind === 'ticket_card' && <TicketCard ticket={group.block.ticket} />}
            {group.block.kind === 'ticket_selector' && (
              <TicketSelector
                tickets={group.block.tickets}
                selectedId={group.block.tickets.find((ticket) => interaction.chosenText?.startsWith(ticket.id))?.id ?? null}
                disabled={!interaction.interactive || interaction.busy}
                onSelect={interaction.onSelectTicket}
              />
            )}
            {group.block.kind === 'draft' && (
              <DraftCard
                draft={group.block.draft}
                pending={interaction.pendingDraftId === group.block.draft.id}
                busy={interaction.busy}
                onAction={(action) => group.block.kind === 'draft' && interaction.onDraftAction(group.block.draft, action)}
              />
            )}
            {group.block.kind === 'system' && <SystemEvent text={group.block.text} />}
          </div>
        ),
      )}
    </div>
  )
}

export function SystemEvent({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 py-1 text-[12.5px] text-ink-3">
      <span className="h-px flex-1 bg-rule" />
      <span>{text}</span>
      <span className="h-px flex-1 bg-rule" />
    </div>
  )
}

export function EmployeeBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[520px] rounded-[12px_12px_4px_12px] bg-ink px-4 py-[11px] text-[14.5px] leading-[1.45] whitespace-pre-line text-white">{text}</div>
    </div>
  )
}

export function AnalystMessage({ authorName, text }: { authorName: string; text: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 text-[12.5px]">
        <span className="font-semibold text-ink">{authorName}</span>
        <span className="rounded-full bg-violet-soft px-2 py-px text-[11.5px] font-semibold text-violet-text">Analista</span>
      </div>
      <div className="max-w-[600px] rounded-[4px_12px_12px_12px] border border-violet/30 bg-paper px-4 py-3 text-[14.5px] leading-[1.5] whitespace-pre-line text-ink">
        {text}
      </div>
    </div>
  )
}
