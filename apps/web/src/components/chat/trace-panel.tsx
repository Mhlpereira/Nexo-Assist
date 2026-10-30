'use client'

import type { DecisionTrace, TraceAction } from '@nexo/core'
import { AlertTriangle, Ban, Check, ChevronRight, ShieldCheck } from 'lucide-react'
import { SOFT_CLASS, type Tone } from '../ui/tone'

const ROUTE_LABEL: Record<string, string> = {
  respond: 'Responder usando as ferramentas permitidas',
  clarify: 'Pedir esclarecimento antes de agir',
  handoff: 'Transferir para um analista',
  redirect_out_of_scope: 'Redirecionar: assunto fora de TI',
  confirm_draft: 'Executar o rascunho confirmado',
  cancel_draft: 'Descartar o rascunho',
  edit_draft: 'Ajustar o rascunho',
  stale_draft: 'Ignorar rascunho que já não está pendente',
  close_resolved: 'Encerrar a conversa como resolvida',
  show_ticket: 'Mostrar o chamado escolhido',
  list_tickets: 'Listar seus chamados',
  fallback: 'Contingência: modelo indisponível',
}

const CONFIDENCE_TONE: Record<'alta' | 'média' | 'baixa', Tone> = { alta: 'success', média: 'warning', baixa: 'danger' }

const ACTION_ICON: Record<TraceAction['status'], typeof Check> = { ok: Check, error: AlertTriangle, blocked: Ban }
const ACTION_COLOR: Record<TraceAction['status'], string> = { ok: 'text-success-text', error: 'text-danger-text', blocked: 'text-warning-text' }

const pretty = (value: unknown) => (typeof value === 'string' ? value : JSON.stringify(value, null, 2))

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-3 border-t border-rule py-2.5 first:border-t-0 first:pt-0">
      <div className="text-[12px] font-medium tracking-wide text-ink-3 uppercase">{title}</div>
      <div className="min-w-0 text-[13.5px] leading-relaxed text-ink">{children}</div>
    </div>
  )
}

export function TracePanel({ trace, showModel = false }: { trace: DecisionTrace; showModel?: boolean }) {
  const actions = trace.actions.filter((action) => action.tool !== 'ask_options')
  return (
    <div className="mt-1 rounded-xl border border-rule bg-desk/60 px-4 py-3">
      <Section title="Entendi">
        {trace.understood ? (
          <>
            <p>
              <span className="font-medium">{trace.understood.intent}</span> — {trace.understood.summary}
            </p>
            {Object.keys(trace.understood.entities).length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {Object.entries(trace.understood.entities).map(([key, value]) => (
                  <span key={key} className="rounded-md border border-rule bg-paper px-2 py-0.5 text-[12px] text-ink-2">
                    {key}: <span className="font-medium text-ink">{value}</span>
                  </span>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="text-ink-2">
            Você usou um botão (<span className="font-medium">{trace.input.text}</span>), então não precisei interpretar texto.
          </p>
        )}
      </Section>

      <Section title="Confiança">
        {trace.confidence ? (
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12.5px] font-semibold ${SOFT_CLASS[CONFIDENCE_TONE[trace.confidence.level]]}`}>
            {trace.confidence.level} · {Math.round(trace.confidence.score * 100)}%
          </span>
        ) : (
          <span className="text-ink-2">Total — ação explícita, sem interpretação</span>
        )}
      </Section>

      <Section title="Decidi">
        <p className="font-medium">{ROUTE_LABEL[trace.decision.route] ?? trace.decision.route}</p>
        <p className="text-ink-2">Por quê: {trace.decision.rationale}</p>
      </Section>

      {trace.decision.rules.length > 0 && (
        <Section title="Regras">
          <ul className="space-y-1">
            {trace.decision.rules.map((rule) => (
              <li key={rule.id} className="text-ink-2">
                <span className="font-data text-[12px] text-ink-3">{rule.id}</span> {rule.text}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Ações">
        {actions.length === 0 ? (
          <span className="text-ink-2">Nenhuma ação externa neste turno.</span>
        ) : (
          <ul className="space-y-1">
            {actions.map((action, index) => {
              const Icon = ACTION_ICON[action.status]
              return (
                <li key={`${action.tool}-${index}`}>
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-center gap-2 text-ink">
                      <ChevronRight size={13} className="text-ink-3 transition group-open:rotate-90" />
                      <Icon size={13} className={ACTION_COLOR[action.status]} />
                      <span>{action.label}</span>
                      <span className="text-[12px] text-ink-3">
                        {action.durationMilliseconds} ms{action.attempts > 1 ? ` · ${action.attempts} tentativas` : ''}
                      </span>
                    </summary>
                    <div className="mt-1.5 ml-6 grid gap-1.5 text-[12px]">
                      <pre className="overflow-x-auto rounded-md bg-paper p-2 font-data text-ink-2">entrada: {pretty(action.input)}</pre>
                      <pre className="overflow-x-auto rounded-md bg-paper p-2 font-data text-ink-2">resultado: {pretty(action.output)}</pre>
                    </div>
                  </details>
                </li>
              )
            })}
          </ul>
        )}
      </Section>

      <Section title="Guardrails">
        {trace.guardrails.length === 0 ? (
          <span className="inline-flex items-center gap-1.5 text-ink-2">
            <ShieldCheck size={14} className="text-success-text" /> Nenhum acionado
          </span>
        ) : (
          <ul className="space-y-1">
            {trace.guardrails.map((finding, index) => (
              <li key={`${finding.id}-${index}`} className="text-ink-2">
                <span className="font-data text-[12px] text-warning-text">{finding.id}</span> {finding.effect}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {showModel && (
        <Section title="Modelo">
          {trace.llm ? (
            <span className="font-data text-[12px] text-ink-2">
              {trace.llm.model} · {trace.llm.calls} chamadas · {trace.llm.inputTokens} + {trace.llm.outputTokens} tokens · {trace.llm.latencyMilliseconds} ms
            </span>
          ) : (
            <span className="text-ink-2">Sem chamada ao modelo (caminho determinístico)</span>
          )}
        </Section>
      )}
    </div>
  )
}
