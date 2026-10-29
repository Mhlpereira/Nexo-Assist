export interface LlmConfiguration {
  model: string
  ollamaBaseUrl: string
  dailyBudget: number
}

type ProviderModelId = `${string}/${string}`

const isProviderModelId = (value: string): value is ProviderModelId => /^[^/]+\/.+$/.test(value)

const OLLAMA_PREFIX = 'ollama/'

export function resolveModel(configuration: Pick<LlmConfiguration, 'model' | 'ollamaBaseUrl'>) {
  const { model, ollamaBaseUrl } = configuration
  if (model.startsWith(OLLAMA_PREFIX)) {
    return { providerId: 'ollama', modelId: model.slice(OLLAMA_PREFIX.length), url: `${ollamaBaseUrl}/v1`, apiKey: 'ollama' }
  }
  if (!isProviderModelId(model)) throw new Error(`LLM_MODEL deve estar no formato provedor/modelo, recebido "${model}"`)
  return { id: model }
}
