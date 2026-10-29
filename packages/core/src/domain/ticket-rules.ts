import { isActive, type Category, type Ticket } from './ticket'

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000
export const REOPEN_WINDOW_DAYS = 7

const STOPWORDS = new Set(
  'a o e de da do das dos em no na nos nas um uma uns umas para por com sem que meu minha meus minhas nao não esta está estou ao aos se mais muito ja já foi ser ter tem quando como'.split(
    ' ',
  ),
)

const tokenize = (text: string): Set<string> =>
  new Set(
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 2 && !STOPWORDS.has(word)),
  )

export function similarity(firstText: string, secondText: string): number {
  const left = tokenize(firstText)
  const right = tokenize(secondText)
  if (left.size === 0 || right.size === 0) return 0
  const shared = [...left].filter((word) => right.has(word)).length
  return shared / (left.size + right.size - shared)
}

export interface DuplicateMatch {
  ticket: Ticket
  score: number
}

const SAME_CATEGORY_THRESHOLD = 0.2
const ANY_CATEGORY_THRESHOLD = 0.45

export function findLikelyDuplicate(
  issue: { category: Category; text: string },
  tickets: Ticket[],
): DuplicateMatch | null {
  let best: DuplicateMatch | null = null
  for (const ticket of tickets.filter((candidate) => isActive(candidate.status))) {
    const score = similarity(issue.text, `${ticket.title} ${ticket.description}`)
    const threshold = ticket.category === issue.category ? SAME_CATEGORY_THRESHOLD : ANY_CATEGORY_THRESHOLD
    if (score >= threshold && (!best || score > best.score)) best = { ticket, score }
  }
  return best
}

export const canUpdate = (ticket: Ticket): boolean => isActive(ticket.status)

export function canReopen(ticket: Ticket, now: Date): boolean {
  if (ticket.status !== 'resolved' || !ticket.resolvedAt) return false
  return now.getTime() - ticket.resolvedAt.getTime() <= REOPEN_WINDOW_DAYS * MILLISECONDS_PER_DAY
}
