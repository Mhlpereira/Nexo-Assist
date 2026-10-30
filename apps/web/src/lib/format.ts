const timeFormatter = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
const dayFormatter = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: 'short' })

export const formatTime = (value: string | Date) => timeFormatter.format(new Date(value))
export const formatDay = (value: string | Date) => dayFormatter.format(new Date(value)).replace(' de ', ' ').replace('.', '')
export const formatDayTime = (value: string | Date) => `${formatDay(value)}, ${formatTime(value)}`

export function formatRelativeShort(value: string | Date, now = new Date()): string {
  const date = new Date(value)
  const sameDay = formatDay(date) === formatDay(now) && now.getTime() - date.getTime() < 86_400_000
  if (now.getTime() - date.getTime() < 60_000) return 'agora'
  if (sameDay) return formatTime(date)
  if (now.getTime() - date.getTime() < 2 * 86_400_000) return 'ontem'
  return formatDay(date)
}
