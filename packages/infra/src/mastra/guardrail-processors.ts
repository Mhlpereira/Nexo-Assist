import { checkInput } from '@nexo/core'
import type { MastraDBMessage } from '@mastra/core/memory'
import { TokenLimiter, type InputProcessor } from '@mastra/core/processors'

const MAX_INPUT_TOKENS = 6000

const maskText = (text: string) => {
  const check = checkInput(text)
  return check.blocked ? text : check.text
}

export const secretMaskingProcessor: InputProcessor = {
  id: 'nexo-secret-masking',
  async processInput({ messages }: { messages: MastraDBMessage[] }): Promise<MastraDBMessage[]> {
    return messages.map((message) => ({
      ...message,
      content: {
        ...message.content,
        parts: message.content.parts?.map((part) => (part.type === 'text' ? { ...part, text: maskText(part.text) } : part)),
      },
    }))
  },
}

export const inputGuardrails = (): InputProcessor[] => [secretMaskingProcessor, new TokenLimiter(MAX_INPUT_TOKENS)]
