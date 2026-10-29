import { readFile } from 'node:fs/promises'
import postgres from 'postgres'

export type Sql = postgres.Sql

export const connect = (url: string, schema = 'tickets'): Sql =>
  postgres(url, { connection: { search_path: schema }, transform: postgres.camel, onnotice: () => {} })

export async function migrate(sql: Sql, schema = 'tickets'): Promise<void> {
  await sql.unsafe(`create schema if not exists "${schema}"`)
  await sql.unsafe(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'))
}
