'use client'

import { HANDOFF_REASON_LABEL, type ConversationDetail, type Message, type MessageBlock } from '@nexo/core'
import { ArrowRightLeft, Bot, CheckCheck, CircleCheckBig, Hand, Headset, Loader2, SendHorizontal, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { formatTime } from '@/lib/format'
import { TracePanel } from '../chat/trace-panel'
import { Avatar } from '../ui/avatar'
import { SOFT_CLASS } from '../ui/tone'

interface ConsoleConversationProps {
  detail: ConversationDetail
  analystId: string
  busy: boolean
  onAction: (action: 'take-over' | 'return-to-agent' | 'close') => void
  onSend: (text: string) => Promise<boolean>
}

const SYSTEM_ICON = { transfer: ArrowRightLeft, takeover: Headset, return: Bot, close: CircleCheckBig }

function describeBlock(block: MessageBlock): string | null {
  switch (block.kind) {
    case 'ticket_card':
      return `Card: ${block.ticket.id} · ${block.ticket.title} — ${block.ticket.statusLabel}${block.ticket.overdue ? ' (vencido)' : ''}`
    case 'ticket_selector':
      return `Seleção de chamados: ${block.tickets.map((ticket) => ticket.id).join(', ')}`
    case 'draft':
      return `Rascunho ${block.draft.id}: ${block.draft.title}`
    case 'quick_replies':
      return `Opções: ${block.options.map((option) => option.label).join(' · ')}`
    default:
      return null
  }
}

const textOf = (message: Message) => message.blocks.flatMap((block) => (block.kind === 'text' ? [block.text] : [])).join('\n')

function SystemLine({ icon, text }: { icon: keyof typeof SYSTEM_ICON; text: string }) {
  const Icon = SYSTEM_ICON[icon]
  return (
    <div className="flex items-center justify-center gap-1.5 pt-[18px] pb-1 text-[12px] font-medium text-ink-3">
      <Icon size={13} />
      {text}
    </div>
  )
}

function ConsoleMessage({ message }: { message: Message }) {
  const [traceOpen, setTraceOpen] = useState(false)
  const systemLines = message.blocks.flatMap((block) => (block.kind === 'system' ? [block] : []))
  if (message.author === 'system') {
    return systemLines.map((block) => <SystemLine key={block.text} icon={block.icon} text={block.text} />)
  }

  const fromEmployee = message.author === 'employee'
  const attachments = message.blocks.map(describeBlock).filter((line): line is string => line !== null)
  const content = textOf(message)

  return (
    <div className={`flex flex-col gap-1 pt-4 ${fromEmployee ? 'items-start' : 'items-end'}`}>
      {!fromEmployee && (
        <div className="flex items-center gap-1.5 px-1 text-[12px] font-semibold text-ink-2">
          {message.authorName}
          <span className={`rounded-md px-1.5 py-px text-[11px] ${message.author === 'agent' ? SOFT_CLASS.info : SOFT_CLASS.violet}`}>
            {message.author === 'agent' ? 'IA' : 'Analista'}
          </span>
          {message.trace && (
            <button
              type="button"
              onClick={() => setTraceOpen((open) => !open)}
              className="flex items-center gap-1 rounded-md px-1 font-medium text-primary-text hover:bg-primary-soft"
            >
              <Sparkles size={11} />
              {traceOpen ? 'ocultar' : 'por quê?'}
            </button>
          )}
        </div>
      )}
      <div
        className={`flex max-w-[560px] flex-col gap-1 px-3 pt-2 pb-1.5 shadow-[0_1px_2px_rgba(27,36,49,0.07)] ${
          fromEmployee ? 'rounded-[4px_12px_12px_12px] bg-paper' : message.author === 'agent' ? 'rounded-[12px_4px_12px_12px] bg-[#E6EFFA]' : 'rounded-[12px_4px_12px_12px] bg-violet-soft'
        }`}
      >
        {content && <p className="text-[14.5px] leading-[1.45] whitespace-pre-line text-ink">{content}</p>}
        {attachments.map((line) => (
          <p key={line} className="rounded-md bg-paper/70 px-2 py-1 text-[12.5px] text-ink-2">
            {line}
          </p>
        ))}
        <span className="flex items-center justify-end gap-[3px] text-[11px] text-ink-3">
          {formatTime(message.createdAt)}
          {!fromEmployee && <CheckCheck size={14} className="text-primary" />}
        </span>
      </div>
      {traceOpen && message.trace && (
        <div className="w-full max-w-[640px]">
          <TracePanel trace={message.trace} showModel />
        </div>
      )}
      {systemLines.map((block) => (
        <div key={block.text} className="w-full">
          <SystemLine icon={block.icon} text={block.text} />
        </div>
      ))}
    </div>
  )
}

export function ConsoleConversation({ detail, analystId, busy, onAction, onSend }: ConsoleConversationProps) {
  const [text, setText] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const { summary, handoff } = detail
  const firstName = summary.employee.name.split(' ')[0]
  const mine = summary.status === 'with_analyst' && detail.assignedAnalystId === analystId
  const modeTone = summary.status === 'waiting_analyst' ? SOFT_CLASS.warning : summary.status === 'with_analyst' ? SOFT_CLASS.violet : summary.status === 'agent' ? SOFT_CLASS.info : SOFT_CLASS.success
  const modeLabel = summary.status === 'waiting_analyst' ? 'Aguardando atendente' : summary.status === 'with_analyst' ? (mine ? 'Você está atendendo' : summary.tag) : summary.status === 'agent' ? 'Agent atendendo' : 'Encerrada'

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [detail.messages.length])

  const submit = async () => {
    const trimmed = text.trim()
    if (!trimmed) return
    if (await onSend(trimmed)) setText('')
  }

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-canvas">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-rule bg-paper pr-4 pl-5">
        <Avatar name={summary.employee.name} size={40} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[15.5px] font-semibold text-ink">{summary.employee.name}</span>
          <span className="truncate text-[12.5px] text-ink-3">
            {summary.employee.department}
            {handoff?.ticketId ? ` · ${handoff.ticketId}` : ''}
          </span>
        </div>
        {mine ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => onAction('return-to-agent')}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-ink/[0.12] pr-3 pl-2.5 text-[13.5px] font-medium text-ink-2 hover:bg-desk disabled:opacity-60"
            >
              <Bot size={15} /> Devolver ao agent
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onAction('close')}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-danger-soft pr-3 pl-2.5 text-[13.5px] font-medium text-danger-text hover:brightness-95 disabled:opacity-60"
            >
              <CircleCheckBig size={15} /> Encerrar atendimento
            </button>
          </>
        ) : (
          <span className={`flex items-center gap-[7px] rounded-full px-[11px] py-1.5 text-[12.5px] font-semibold ${modeTone}`}>
            <Bot size={14} /> {modeLabel}
          </span>
        )}
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-10 pt-5 pb-4">
        {handoff && (
          <div className="mx-auto mb-2 max-w-[720px] rounded-xl border border-warning/30 bg-paper p-4">
            <div className="mb-1.5 flex items-center gap-2 text-[12.5px] font-semibold text-warning-text">
              <ArrowRightLeft size={14} /> Resumo da transferência · {HANDOFF_REASON_LABEL[handoff.reason]}
              {handoff.confidence !== null && <span className="font-medium text-ink-3">· confiança {Math.round(handoff.confidence * 100)}%</span>}
            </div>
            <p className="text-[13.5px] leading-relaxed whitespace-pre-line text-ink-2">{handoff.summary}</p>
          </div>
        )}
        {detail.messages.map((message) => (
          <ConsoleMessage key={message.id} message={message} />
        ))}
      </div>

      <footer className="flex flex-col gap-2.5 border-t border-rule bg-paper px-5 pt-3 pb-3.5">
        {summary.status === 'waiting_analyst' || summary.status === 'agent' ? (
          <>
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-warning-soft text-warning-text">
                <Hand size={17} />
              </span>
              <div className="flex flex-1 flex-col gap-0.5">
                <span className="text-[14.5px] font-semibold text-ink">
                  {summary.status === 'waiting_analyst' ? `${firstName} espera um atendente` : `O agent está atendendo ${firstName}`}
                </span>
                <span className="text-[12.5px] text-ink-3">
                  {summary.status === 'waiting_analyst' ? 'Agent pausado até alguém assumir' : 'Você pode assumir a qualquer momento; o agent será pausado'}
                </span>
              </div>
              {summary.status === 'waiting_analyst' && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onAction('return-to-agent')}
                  className="flex h-9 items-center gap-[7px] rounded-lg border border-ink/[0.12] pr-3.5 pl-3 text-[13.5px] font-medium text-ink-2 shadow-[0_1px_2px_rgba(27,36,49,0.05)] hover:bg-desk disabled:opacity-60"
                >
                  <Bot size={15} /> Devolver ao agent
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => onAction('take-over')}
                className="flex h-9 items-center gap-[7px] rounded-lg bg-cta pr-4 pl-3.5 text-[13.5px] font-semibold text-white hover:brightness-110 disabled:opacity-60"
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Headset size={16} />} Assumir atendimento
              </button>
            </div>
            <div className="flex h-11 items-center rounded-xl bg-desk px-3.5 text-[14.5px] text-ink-3 opacity-55">Assuma o atendimento para responder</div>
          </>
        ) : mine ? (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void submit()
            }}
            className="flex h-11 items-center gap-3"
          >
            <input
              value={text}
              onChange={(event) => setText(event.target.value.slice(0, 2000))}
              placeholder={`Responder para ${firstName}…`}
              aria-label="Mensagem para o funcionário"
              className="h-11 flex-1 rounded-xl border border-ink/[0.12] bg-paper px-3.5 text-[14.5px] text-ink outline-none focus:border-cta/60"
            />
            <button
              type="submit"
              disabled={busy || !text.trim()}
              aria-label="Enviar"
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-cta text-white hover:brightness-110 disabled:opacity-50"
            >
              <SendHorizontal size={18} />
            </button>
          </form>
        ) : (
          <div className="flex h-11 items-center rounded-xl bg-desk px-3.5 text-[14.5px] text-ink-3">
            {summary.status === 'closed' ? 'Conversa encerrada.' : 'Outro analista está atendendo esta conversa.'}
          </div>
        )}
      </footer>
    </section>
  )
}
