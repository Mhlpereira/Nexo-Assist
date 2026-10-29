import type { User, UserRepository } from '@nexo/core'
import type { Sql } from './connection'

export function createPostgresUserRepository(sql: Sql): UserRepository {
  return {
    async findByEmail(email) {
      const [user] = await sql<User[]>`select * from users where email = ${email}`
      return user ?? null
    },
    async findById(userId) {
      const [user] = await sql<User[]>`select * from users where id = ${userId}`
      return user ?? null
    },
  }
}
