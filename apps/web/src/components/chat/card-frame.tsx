import type { ReactNode } from 'react'

export function CardFrame({ children }: { children: ReactNode }) {
  return (
    <div className="w-full overflow-hidden rounded-2xl border border-ink/[0.09] bg-paper shadow-[0_1px_2px_rgba(27,36,49,0.05),0_4px_12px_rgba(27,36,49,0.04)]">
      {children}
    </div>
  )
}

export function CardEyebrow({ kind, reference, status }: { kind: string; reference: string; status: ReactNode }) {
  return (
    <div className="flex items-center gap-2 pb-0.5 text-[12.5px] text-ink-3">
      <span className="font-medium">{kind}</span>
      <span className="h-[3px] w-[3px] rounded-full bg-rule" />
      <span>{reference}</span>
      <span className="flex-1" />
      {status}
    </div>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-[12.5px] text-ink-3">{label}</span>
      <div className="flex flex-wrap items-center gap-x-1.5 text-[14.5px] font-medium whitespace-nowrap text-ink">{children}</div>
    </div>
  )
}
