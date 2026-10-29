import { z } from 'zod'
import { connectDatabase } from './connection'
import { migrateDatabase } from './migrate'
import { seedDatabase } from './seed'

const { DATABASE_URL } = z.object({ DATABASE_URL: z.string().url() }).parse(process.env)
const sql = connectDatabase(DATABASE_URL)
await migrateDatabase(sql)
await seedDatabase(sql)
await sql.end()
console.log('app: schema, usuários e central de ajuda prontos')
