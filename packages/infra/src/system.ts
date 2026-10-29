import { randomUUID } from 'node:crypto'
import type { Clock, IdGenerator } from '@nexo/core'

export const systemClock: Clock = { now: () => new Date() }
export const randomIds: IdGenerator = { uuid: () => randomUUID() }
