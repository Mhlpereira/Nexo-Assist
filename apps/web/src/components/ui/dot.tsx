import { DOT_CLASS, type Tone } from './tone'

export function Dot({ tone, size = 6 }: { tone: Tone; size?: number }) {
  return <span className={`inline-block shrink-0 rounded-full ${DOT_CLASS[tone]}`} style={{ width: size, height: size }} />
}
