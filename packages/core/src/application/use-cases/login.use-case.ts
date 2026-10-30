import { failure, success } from '../../result'
import type { Login } from '../ports/in'
import type { UserRepository } from '../ports/out'

export const createLogin = (users: UserRepository): Login => ({
  async execute(email, password) {
    const user = await users.findByEmail(email.trim().toLowerCase())
    if (!user || password.length === 0) return failure('invalid_credentials')
    return success(user)
  },
})
