'use client'

import type { ConversationView, Draft, EmployeeInput, Message, MessageBlock, QuickReply, TicketView } from '@nexo/core'
import { ArrowUp, Loader2, RotateCcw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, loadConversation, loadMessagesSince, sendInput, startNewConversation, type StreamEvent } from '@/lib/chat-api'
import { Dot } from '../ui/dot'
import { SOFT_CLASS, type Tone } from '../ui/tone'
import { actionsFromTrace, AgentMessage, AnalystMessage, EmployeeBubble, SystemEvent, type LiveAction } from './agent-message'
import { EmployeeShell } from './employee-shell'

interface PendingTurn {
  employeeText: string
  employeeMessageSaved: boolean
  actions: LiveAction[]
  text: string
  blocks: MessageBlock[]
}

interface ChatError {
  message: string
  retryInput: EmployeeInput | null
}

const POLL_INTERVAL_MILLISECONDS = 2500
const MAX_LENGTH = 1000

const textOf = (message: Pick<Message, 'blocks'>) =>
  message.blocks.flatMap((block) => (block.kind === 'text' || block.kind === 'system' ? [block.text] : [])).join('\n')

const inputLabel = (input: EmployeeInput) =>
  input.type === 'text' ? input.text : input.type === 'draft_action' ? { confirm: 'Confirmar', edit: 'Editar', cancel: 'Cancelar' }[input.action] : input.label

function statusPill(conversation: ConversationView | null): { tone: Tone; label: string } {
  if (!conversation) return { tone: 'neutral', label: 'Conectando…' }
  switch (conversation.status) {
    case 'agent':
      return { tone: 'success', label: 'Assistente online' }
    case 'waiting_analyst':
      return { tone: 'warning', label: 'Aguardando um analista' }
    case 'with_analyst':
      return { tone: 'violet', label: `Falando com ${conversation.analystName ?? 'um analista'}` }
    case 'closed':
      return { tone: 'neutral', label: 'Conversa encerrada' }
  }
}

function mergeMessages(current: Message[], incoming: Message[]): Message[] {
  const known = new Set(current.map((message) => message.id))
  const fresh = incoming.filter((message) => !known.has(message.id))
  return fresh.length === 0 ? current : [...current, ...fresh].sort((first, second) => first.createdAt.toString().localeCompare(second.createdAt.toString()))
}

export function ChatView({ user }: { user: { name: string; email: string } }) {
  const [conversation, setConversation] = useState<ConversationView | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [pending, setPending] = useState<PendingTurn | null>(null)
  const [error, setError] = useState<ChatError | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [draftText, setDraftText] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const busy = pending !== null

  const applyConversation = useCallback((loaded: { conversation: ConversationView; messages: Message[] }, replace = false) => {
    setConversation(loaded.conversation)
    setMessages((current) => (replace ? loaded.messages : mergeMessages(current, loaded.messages)))
  }, [])

  useEffect(() => {
    loadConversation()
      .then((loaded) => applyConversation(loaded, true))
      .catch((caught: unknown) => setLoadError(caught instanceof Error ? caught.message : 'Não foi possível carregar a conversa.'))
  }, [applyConversation])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, pending])

  const lastCreatedAt = messages.at(-1)?.createdAt.toString() ?? null
  useEffect(() => {
    if (!conversation || busy || conversation.status === 'closed') return
    const timer = setInterval(() => {
      loadMessagesSince(conversation.id, lastCreatedAt)
        .then((loaded) => applyConversation(loaded))
        .catch(() => undefined)
    }, POLL_INTERVAL_MILLISECONDS)
    return () => clearInterval(timer)
  }, [conversation, busy, lastCreatedAt, applyConversation])

  const send = useCallback(
    async (input: EmployeeInput) => {
      if (!conversation || busy) return
      setError(null)
      setPending({ employeeText: inputLabel(input), employeeMessageSaved: false, actions: [], text: '', blocks: [] })

      const handle = (event: StreamEvent) => {
        switch (event.type) {
          case 'employee_message':
            setMessages((current) => mergeMessages(current, [event.message]))
            setPending((turn) => turn && { ...turn, employeeMessageSaved: true })
            break
          case 'action_start':
            setPending((turn) => turn && { ...turn, actions: [...turn.actions, { id: event.id, label: event.label, status: 'running' }] })
            break
          case 'action_end':
            setPending(
              (turn) => turn && { ...turn, actions: turn.actions.map((action) => (action.id === event.id ? { ...action, status: event.status } : action)) },
            )
            break
          case 'text_delta':
            setPending((turn) => turn && { ...turn, text: turn.text + event.text })
            break
          case 'block':
            if (event.block.kind !== 'text') setPending((turn) => turn && { ...turn, blocks: [...turn.blocks, event.block] })
            break
          case 'done':
            setConversation(event.result.conversation)
            setMessages((current) =>
              mergeMessages(current, event.result.agentMessage ? [event.result.employeeMessage, event.result.agentMessage] : [event.result.employeeMessage]),
            )
            setPending(null)
            break
          case 'error':
            setError({ message: event.message, retryInput: event.error === 'internal' ? input : null })
            setPending(null)
            break
        }
      }

      try {
        await sendInput(conversation.id, input, handle)
      } catch (caught) {
        setError({
          message: caught instanceof ApiError ? caught.message : 'Sem conexão com o servidor. Verifique sua rede e tente de novo.',
          retryInput: caught instanceof ApiError ? null : input,
        })
      } finally {
        setPending(null)
      }
    },
    [conversation, busy],
  )

  const submitText = () => {
    const text = draftText.trim()
    if (!text) return
    setDraftText('')
    void send({ type: 'text', text })
  }

  const onDraftAction = useCallback((draft: Draft, action: 'confirm' | 'edit' | 'cancel') => void send({ type: 'draft_action', draftId: draft.id, action }), [send])

  useEffect(() => {
    const pendingDraftId = conversation?.pendingDraftId
    if (!pendingDraftId) return
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault()
        void send({ type: 'draft_action', draftId: pendingDraftId, action: 'confirm' })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [conversation?.pendingDraftId, send])

  const startOver = async () => {
    try {
      applyConversation(await startNewConversation(), true)
      setError(null)
    } catch (caught) {
      setError({ message: caught instanceof Error ? caught.message : 'Não foi possível iniciar nova conversa.', retryInput: null })
    }
  }

  const pill = statusPill(conversation)
  const limitReached = conversation ? conversation.employeeMessageCount >= conversation.messageLimit : false
  const closed = conversation?.status === 'closed'
  const lastAgentIndex = messages.findLastIndex((message) => message.author === 'agent')
  const acceptsAgentInteraction = conversation?.status === 'agent' && !limitReached

  return (
    <EmployeeShell
      user={user}
      active="chat"
      status={
        <span className={`flex items-center gap-[7px] rounded-full px-2.5 py-[5px] text-[12.5px] font-semibold ${SOFT_CLASS[pill.tone]}`}>
          <Dot tone={pill.tone} size={7} />
          {pill.label}
        </span>
      }
    >
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full max-w-[760px] flex-col justify-end gap-5 px-4 pt-7 pb-1">
          {loadError && <p className="rounded-lg bg-danger-soft px-4 py-3 text-[13.5px] text-danger-text">{loadError}</p>}
          {!conversation && !loadError && (
            <p className="flex items-center gap-2 text-[13.5px] text-ink-3">
              <Loader2 size={14} className="animate-spin" /> Carregando sua conversa…
            </p>
          )}

          {messages.map((message, index) => {
            const nextEmployee = messages.slice(index + 1).find((candidate) => candidate.author === 'employee')
            switch (message.author) {
              case 'employee':
                return <EmployeeBubble key={message.id} text={textOf(message)} />
              case 'system':
                return <SystemEvent key={message.id} text={textOf(message)} />
              case 'analyst':
                return <AnalystMessage key={message.id} authorName={message.authorName} text={textOf(message)} />
              case 'agent':
                return (
                  <AgentMessage
                    key={message.id}
                    authorName={message.authorName}
                    blocks={message.blocks}
                    actions={actionsFromTrace(message.trace)}
                    trace={message.trace}
                    interaction={{
                      interactive: index === lastAgentIndex && acceptsAgentInteraction,
                      busy,
                      pendingDraftId: conversation?.pendingDraftId ?? null,
                      chosenText: nextEmployee ? textOf(nextEmployee) : null,
                      onQuickReply: (option: QuickReply) => void send({ type: 'quick_reply', label: option.label, value: option.value }),
                      onSelectTicket: (ticket: TicketView) => void send({ type: 'select_ticket', ticketId: ticket.id, label: `${ticket.id} · ${ticket.title}` }),
                      onDraftAction,
                    }}
                  />
                )
            }
          })}

          {pending && (
            <>
              {!pending.employeeMessageSaved && <EmployeeBubble text={pending.employeeText} />}
              {conversation?.status === 'agent' && (
                <AgentMessage
                  authorName="Nexo Assist"
                  blocks={[...(pending.text ? [{ kind: 'text' as const, text: pending.text }] : []), ...pending.blocks]}
                  actions={pending.actions}
                  trace={null}
                  streaming
                  interaction={{
                    interactive: false,
                    busy: true,
                    pendingDraftId: null,
                    chosenText: null,
                    onQuickReply: () => undefined,
                    onSelectTicket: () => undefined,
                    onDraftAction: () => undefined,
                  }}
                />
              )}
            </>
          )}

          {conversation?.status === 'waiting_analyst' && !pending && (
            <p className="text-center text-[12.5px] text-ink-3">Um analista vai continuar por aqui. Você pode deixar mais detalhes enquanto espera.</p>
          )}
        </div>
      </div>

      <div className="mx-auto w-full max-w-[760px] px-4 pt-2.5 pb-[18px]">
        {error && (
          <div role="alert" className="mb-2 flex items-center justify-between gap-3 rounded-lg bg-danger-soft px-3.5 py-2.5 text-[13.5px] text-danger-text">
            <span>{error.message}</span>
            {error.retryInput && (
              <button
                type="button"
                onClick={() => error.retryInput && void send(error.retryInput)}
                className="flex shrink-0 items-center gap-1.5 font-semibold hover:underline"
              >
                <RotateCcw size={13} /> Tentar novamente
              </button>
            )}
          </div>
        )}

        {closed || limitReached ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-rule bg-desk px-4 py-3 text-[13.5px] text-ink-2">
            <span>{closed ? 'Esta conversa foi encerrada.' : 'Você atingiu o limite de 30 mensagens desta conversa.'}</span>
            <div className="flex gap-2">
              {limitReached && !closed && conversation?.status === 'agent' && (
                <button
                  type="button"
                  onClick={() => void send({ type: 'quick_reply', label: 'Falar com um analista', value: 'action:handoff' })}
                  className="rounded-lg border border-rule bg-paper px-3 py-1.5 font-medium text-ink hover:bg-desk"
                >
                  Falar com um analista
                </button>
              )}
              <button type="button" onClick={() => void startOver()} className="rounded-lg bg-cta px-3 py-1.5 font-semibold text-white hover:brightness-110">
                Nova conversa
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              submitText()
            }}
            className="flex min-h-12 items-end gap-2 rounded-xl border border-ink/[0.12] bg-paper py-1.5 pr-1.5 pl-4 focus-within:border-cta/60"
          >
            <textarea
              value={draftText}
              onChange={(event) => setDraftText(event.target.value.slice(0, MAX_LENGTH))}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
                  event.preventDefault()
                  submitText()
                }
              }}
              rows={1}
              placeholder={conversation?.status === 'with_analyst' ? `Escreva para ${conversation.analystName ?? 'o analista'}…` : 'Escreva para o Nexo…'}
              disabled={!conversation || busy}
              aria-label="Mensagem"
              className="max-h-40 min-h-9 flex-1 resize-none bg-transparent py-2 text-[14.5px] text-ink outline-none placeholder:text-ink-3 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!conversation || busy || !draftText.trim()}
              className="flex h-9 items-center gap-1.5 rounded-md bg-cta px-3 text-[13.5px] font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <ArrowUp size={14} />}
              Enviar
            </button>
          </form>
        )}
        <div className="mt-1.5 flex justify-end text-[12.5px] text-ink-3">
          {conversation ? `${conversation.employeeMessageCount}/${conversation.messageLimit} mensagens nesta sessão` : ' '}
        </div>
      </div>
    </EmployeeShell>
  )
}
