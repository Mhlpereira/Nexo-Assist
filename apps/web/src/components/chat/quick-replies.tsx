import type { QuickReply } from '@nexo/core'

interface QuickRepliesProps {
  options: QuickReply[]
  chosen: string | null
  disabled: boolean
  onChoose: (option: QuickReply) => void
}

export function QuickReplies({ options, chosen, disabled, onChoose }: QuickRepliesProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const isChosen = option.label === chosen
        return (
          <button
            key={option.label}
            type="button"
            disabled={disabled}
            onClick={() => onChoose(option)}
            className={`rounded-lg border px-3 py-[7px] text-[13.5px] font-medium transition disabled:cursor-default ${
              isChosen ? 'border-primary bg-primary-soft text-primary-text' : 'border-rule bg-paper text-ink enabled:hover:border-primary/50 enabled:hover:bg-primary-soft/50 disabled:text-ink-3'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
