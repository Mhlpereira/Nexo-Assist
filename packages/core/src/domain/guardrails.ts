import { TICKET_ID_PATTERN } from './ticket'

export const MAX_MESSAGE_LENGTH = 1000
const MASK = '••••••'

export interface GuardrailFinding {
  id: 'GR-03' | 'GR-04' | 'GR-05' | 'GR-07' | 'GR-08' | 'GR-09'
  effect: string
}

const INJECTION_PATTERNS = [
  /ignore\s+(as|todas\s+as|suas|the|all|previous|any)\s+(instru|regras|instructions|rules)/i,
  /esque[cç]a\s+(as|suas|todas)\s+(instru|regras)/i,
  /(voc[eê]\s+agora\s+[eé]\s|you\s+are\s+now|aja\s+como|act\s+as)/i,
  /(system\s*prompt|prompt\s+do\s+sistema|suas\s+instru[cç][oõ]es\s+internas)/i,
  /chamados?\s+d[eoa]s?\s+(outr[oa]s?|tod[oa]s|colegas?)/i,
  /(modo\s+desenvolvedor|developer\s+mode|jailbreak)/i,
]

const SECRET_PATTERNS = [
  /\b((?:minha\s+)?(?:senha|password|passwd|pwd|pin)\s*(?:é|eh|:|=|era|atual\s+é)\s*)(\S{3,})/gi,
  /\b((?:token|api[\s_-]?key|chave)\s*(?:é|:|=)\s*)(\S{8,})/gi,
]

export type InputCheck =
  | { blocked: true; reason: 'empty' | 'too_long'; findings: GuardrailFinding[] }
  | { blocked: false; text: string; injectionSuspected: boolean; findings: GuardrailFinding[] }

export function checkInput(raw: string): InputCheck {
  const trimmed = raw.trim()
  if (!trimmed) return { blocked: true, reason: 'empty', findings: [] }
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    return {
      blocked: true,
      reason: 'too_long',
      findings: [{ id: 'GR-07', effect: `Mensagem com ${trimmed.length} caracteres (máx. ${MAX_MESSAGE_LENGTH})` }],
    }
  }

  const findings: GuardrailFinding[] = []
  let text = trimmed
  for (const pattern of SECRET_PATTERNS) text = text.replace(pattern, (_match, prefix: string) => `${prefix}${MASK}`)
  if (text !== trimmed) findings.push({ id: 'GR-05', effect: 'Senha ou token mascarado antes de salvar e de enviar ao modelo' })

  const injectionSuspected = INJECTION_PATTERNS.some((pattern) => pattern.test(trimmed))
  if (injectionSuspected) {
    findings.push({ id: 'GR-04', effect: 'Possível tentativa de manipular o assistente: ações de escrita desabilitadas neste turno' })
  }

  return { blocked: false, text, injectionSuspected, findings }
}

export const containsMaskedSecret = (text: string): boolean => text.includes(MASK)

export function filterForeignTicketIds(
  text: string,
  ownTicketIds: ReadonlySet<string>,
): { text: string; findings: GuardrailFinding[] } {
  const removed = new Set<string>()
  const filtered = text.replace(TICKET_ID_PATTERN, (id) => {
    if (ownTicketIds.has(id)) return id
    removed.add(id)
    return '[chamado não encontrado]'
  })
  const findings: GuardrailFinding[] =
    removed.size > 0 ? [{ id: 'GR-03', effect: `Removido da resposta: ${[...removed].join(', ')} (não pertence a você)` }] : []
  return { text: filtered, findings }
}
