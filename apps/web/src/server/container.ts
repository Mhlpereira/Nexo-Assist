import {
  createAnalystConsole,
  createEmployeeConversations,
  createHandleEmployeeInput,
  createLogin,
  type AnalystConsole,
  type EmployeeConversations,
  type HandleEmployeeInput,
  type Login,
} from '@nexo/core'
import {
  connectDatabase,
  createDailyBudget,
  createHttpTicketGateway,
  createMastraInterpreter,
  createMastraResponder,
  createPostgresConversationRepository,
  createPostgresKnowledgeBase,
  createPostgresUserRepository,
  randomIds,
  systemClock,
} from '@nexo/infra'
import { environment } from './environment'

export interface Container {
  login: Login
  handleEmployeeInput: HandleEmployeeInput
  employeeConversations: EmployeeConversations
  analystConsole: AnalystConsole
}

function createContainer(): Container {
  const sql = connectDatabase(environment.DATABASE_URL)
  const conversations = createPostgresConversationRepository(sql)
  const users = createPostgresUserRepository(sql)
  const tickets = createHttpTicketGateway({ baseUrl: environment.TICKETS_SERVICE_URL, serviceToken: environment.TICKETS_SERVICE_TOKEN })
  const llmConfiguration = { model: environment.LLM_MODEL, ollamaBaseUrl: environment.OLLAMA_BASE_URL, dailyBudget: environment.LLM_DAILY_BUDGET }
  const budget = createDailyBudget(environment.LLM_DAILY_BUDGET)

  return {
    login: createLogin(users),
    handleEmployeeInput: createHandleEmployeeInput({
      conversations,
      users,
      tickets,
      knowledgeBase: createPostgresKnowledgeBase(sql),
      interpreter: createMastraInterpreter(llmConfiguration, budget),
      responder: createMastraResponder(llmConfiguration, budget),
      clock: systemClock,
      ids: randomIds,
    }),
    employeeConversations: createEmployeeConversations({ conversations, users, clock: systemClock }),
    analystConsole: createAnalystConsole({ conversations, users, tickets, clock: systemClock }),
  }
}

const globalForContainer = globalThis as typeof globalThis & { nexoContainer?: Container }

export function container(): Container {
  globalForContainer.nexoContainer ??= createContainer()
  return globalForContainer.nexoContainer
}
