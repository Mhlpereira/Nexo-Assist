export interface DailyBudget {
  tryConsume(): boolean
  remaining(): number
}

export function createDailyBudget(limit: number, now: () => Date = () => new Date()): DailyBudget {
  let day = ''
  let used = 0
  const rollOver = () => {
    const today = now().toISOString().slice(0, 10)
    if (today !== day) {
      day = today
      used = 0
    }
  }
  return {
    tryConsume() {
      rollOver()
      if (used >= limit) return false
      used++
      return true
    },
    remaining() {
      rollOver()
      return limit - used
    },
  }
}
