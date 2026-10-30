export const initialsOf = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')

export function Avatar({ name, size = 34, online = false }: { name: string; size?: number; online?: boolean }) {
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center rounded-full bg-primary-soft font-bold text-primary-text"
      style={{ width: size, height: size, fontSize: size * 0.37 }}
    >
      {initialsOf(name)}
      {online && <span className="absolute right-0 bottom-0 h-2.5 w-2.5 rounded-full border-2 border-paper bg-success" />}
    </span>
  )
}
