import type { User } from '../../dto/user.dto'

export interface UserRepository {
  findByEmail(email: string): Promise<User | null>
  findById(userId: string): Promise<User | null>
}
