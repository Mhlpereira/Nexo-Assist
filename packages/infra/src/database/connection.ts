import { readFile } from 'node:fs/promises'
import postgres from 'postgres'

export type Sql = postgres.Sql

export const connectDatabase = (databaseUrl: string, schema = 'app'): Sql =>
  postgres(databaseUrl, { connection: { search_path: `${schema},public` }, transform: postgres.camel, onnotice: () => {} })

export async function migrateDatabase(sql: Sql, schema = 'app'): Promise<void> {
  await sql.unsafe(`create schema if not exists "${schema}"`)
  await sql.unsafe(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'))
}

export const toJsonb = (value: unknown) => JSON.stringify(value)
