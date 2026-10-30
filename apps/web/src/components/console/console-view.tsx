'use client'

import type { ConsoleFilter, ConsoleList, ConversationDetail, ConversationSummary } from '@nexo/core'
import { CheckCheck, Loader2, LogOut, MessageCircle, Search } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { logout, requestJson } from '@/lib/chat-api'
import { formatRelativeShort } from '@/lib/format'
import { Avatar } from '../ui/avatar'
import { BrandMark } from '../ui/brand-mark'
import { Dot } from '../ui/dot'
import { TEXT_CLASS, type Tone } from '../ui/tone'
import { ConsoleConversation } from './console-conversation'
import { ConsoleTickets } from './console-tickets'

const FILTERS: { key: ConsoleFilter; label: string }[] = [
  { key: 'all', label: 'Todas' },
  { key: 'for_you', label: 'Para você' },
  { key: 'with_agent', label: 'Com o agent' },
  { key: 'mine', label: 'Minhas' },
]

const LIST_POLL_MILLISECONDS = 3000
const DETAIL_POLL_MILLISECONDS = 2500

function ConversationItem({ summary, selected, onSelect }: { summary: ConversationSummary; selected: boolean; onSelect: () => void }) {
  const tone: Tone = summary.tagTone
  const needsAttention = summary.unread > 0
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition ${selected ? 'bg-desk' : 'hover:bg-desk/60'}`}
    >
      <Avatar name={summary.employee.name} size={46} online={summary.status !== 'closed'} />
      <div className={`flex min-w-0 flex-1 flex-col gap-[3px] pb-2.5 ${selected ? '' : 'border-b border-rule'}`}>
        <div className="flex items-center gap-2">
          <span className={`flex-1 truncate text-[15.5px] text-ink ${needsAttention ? 'font-semibold' : 'font-medium'}`}>{summary.employee.name}</span>
          <span className={`text-[12.5px] ${needsAttention ? 'font-semibold text-cta' : 'text-ink-3'}`}>
            {summary.lastMessageAt ? formatRelativeShort(summary.lastMessageAt) : ''}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {summary.lastMessagePreview.startsWith('Nexo:') && <CheckCheck size={15} className="shrink-0 text-primary" />}
          <span className="flex-1 truncate text-[13.5px] text-ink-3">{summary.lastMessagePreview || 'Sem mensagens'}</span>
          {needsAttention && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-cta px-1.5 text-[11.5px] font-bold text-white">{summary.unread}</span>
          )}
        </div>
        <span className={`flex items-center gap-[5px] text-[11.5px] font-medium ${TEXT_CLASS[tone]}`}>
          <Dot tone={tone} />
          {summary.tag}
        </span>
      </div>
    </button>
  )
}

export function ConsoleView({ analyst }: { analyst: { id: string; name: string } }) {
  const [filter, setFilter] = useState<ConsoleFilter>('all')
  const [search, setSearch] = useState('')
  const [list, setList] = useState<ConsoleList | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ConversationDetail | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refreshList = useCallback(async () => {
    try {
      setList(await requestJson<ConsoleList>(`/api/console/conversations?filter=${filter}&search=${encodeURIComponent(search)}`))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Falha ao carregar conversas.')
    }
  }, [filter, search])

  const refreshDetail = useCallback(async () => {
    if (!selectedId) return
    try {
      setDetail(await requestJson<ConversationDetail>(`/api/console/conversations/${selectedId}`))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Falha ao carregar a conversa.')
    }
  }, [selectedId])

  useEffect(() => {
    void refreshList()
    const timer = setInterval(() => void refreshList(), LIST_POLL_MILLISECONDS)
    return () => clearInterval(timer)
  }, [refreshList])

  useEffect(() => {
    setDetail(null)
    void refreshDetail()
    const timer = setInterval(() => void refreshDetail(), DETAIL_POLL_MILLISECONDS)
    return () => clearInterval(timer)
  }, [refreshDetail])

  useEffect(() => {
    if (!selectedId && list?.conversations[0]) setSelectedId(list.conversations[0].id)
  }, [list, selectedId])

  const runAction = async (action: 'take-over' | 'return-to-agent' | 'close') => {
    if (!selectedId) return
    setBusy(true)
    setError(null)
    try {
      await requestJson(`/api/console/conversations/${selectedId}/${action}`, { method: 'POST' })
      await Promise.all([refreshDetail(), refreshList()])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível completar a ação.')
    } finally {
      setBusy(false)
    }
  }

  const sendMessage = async (text: string) => {
    if (!selectedId) return false
    setBusy(true)
    try {
      await requestJson(`/api/console/conversations/${selectedId}/messages`, { method: 'POST', body: JSON.stringify({ text }) })
      await refreshDetail()
      return true
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Mensagem não enviada.')
      return false
    } finally {
      setBusy(false)
    }
  }

  const focusTicketId = detail?.handoff?.ticketId ?? detail?.messages.findLast((message) => message.blocks.some((block) => block.kind === 'ticket_card'))?.blocks.find((block) => block.kind === 'ticket_card')?.ticket.id ?? null
  const forYouCount = list?.counts.for_you ?? 0

  return (
    <div className="flex h-dvh bg-paper">
      <nav className="flex w-16 shrink-0 flex-col items-center gap-1.5 border-r border-rule bg-desk py-4">
        <div className="flex h-10 w-10 items-center justify-center pb-2 text-ink">
          <BrandMark size={22} />
        </div>
        <span className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-paper text-ink shadow-[0_1px_2px_rgba(27,36,49,0.1)]">
          <MessageCircle size={19} />
          {forYouCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-desk bg-cta px-1 text-[10px] font-bold text-white">
              {forYouCount}
            </span>
          )}
        </span>
        <span className="flex-1" />
        <Avatar name={analyst.name} size={36} online />
        <button type="button" onClick={logout} aria-label="Sair" className="mt-2 flex h-9 w-9 items-center justify-center rounded-lg text-ink-3 hover:bg-paper">
          <LogOut size={16} />
        </button>
      </nav>

      <section className="flex w-[380px] shrink-0 flex-col border-r border-rule">
        <header className="flex flex-col gap-3 px-4 pt-4 pb-2.5">
          <div className="flex items-center gap-2">
            <h1 className="flex-1 text-[20px] font-bold tracking-[-0.3px] text-ink">Conversas</h1>
            <span className="flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-[5px] text-[12.5px] font-semibold text-success-text">
              <Dot tone="success" size={7} /> Disponível
            </span>
          </div>
          <label className="flex h-9 items-center gap-2.5 rounded-full bg-desk px-3">
            <Search size={15} className="text-ink-3" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Pesquisar conversa ou chamado"
              className="flex-1 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-ink-3"
            />
          </label>
          <div className="flex gap-1">
            {FILTERS.map((option) => {
              const active = option.key === filter
              const count = list?.counts[option.key]
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setFilter(option.key)}
                  className={`flex items-center gap-1.5 rounded-full px-[9px] py-1.5 text-[12.5px] font-medium transition ${active ? 'bg-primary-soft text-primary-text' : 'bg-desk text-ink-2 hover:bg-rule'}`}
                >
                  {option.label}
                  {option.key !== 'all' && count !== undefined && <span className={`font-semibold ${active ? 'text-primary-text' : 'text-ink-3'}`}>{count}</span>}
                </button>
              )
            })}
          </div>
        </header>
        <div className="flex-1 overflow-y-auto px-2">
          {!list && (
            <p className="flex items-center gap-2 px-3 py-4 text-[13.5px] text-ink-3">
              <Loader2 size={14} className="animate-spin" /> Carregando conversas…
            </p>
          )}
          {list?.conversations.length === 0 && <p className="px-3 py-4 text-[13.5px] text-ink-3">Nenhuma conversa neste filtro.</p>}
          {list?.conversations.map((summary) => (
            <ConversationItem key={summary.id} summary={summary} selected={summary.id === selectedId} onSelect={() => setSelectedId(summary.id)} />
          ))}
        </div>
      </section>

      <div className="relative flex min-w-0 flex-1">
        {error && (
          <div role="alert" className="absolute top-20 left-1/2 z-10 -translate-x-1/2 rounded-lg bg-danger-soft px-4 py-2 text-[13.5px] text-danger-text shadow">
            {error}
            <button type="button" className="ml-3 font-semibold" onClick={() => setError(null)}>
              Fechar
            </button>
          </div>
        )}
        {detail ? (
          <>
            <ConsoleConversation detail={detail} analystId={analyst.id} busy={busy} onAction={(action) => void runAction(action)} onSend={sendMessage} />
            <ConsoleTickets
              employeeName={detail.employee.name}
              tickets={detail.tickets}
              handoff={detail.handoff}
              focusTicketId={focusTicketId}
              assignedAnalystName={detail.summary.status === 'with_analyst' ? (detail.assignedAnalystId === analyst.id ? analyst.name : 'outro analista') : null}
            />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center bg-canvas text-[13.5px] text-ink-3">
            {selectedId ? <Loader2 size={16} className="animate-spin" /> : 'Selecione uma conversa'}
          </div>
        )}
      </div>
    </div>
  )
}
