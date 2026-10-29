import type { Result } from '../../../result'
import type { User } from '../../dto/user.dto'

export interface Login {
  execute(email: string, password: string): Promise<Result<User, 'invalid_credentials'>>
}
