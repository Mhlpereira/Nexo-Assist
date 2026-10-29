import { readFile } from 'node:fs/promises'
import type { Sql } from './connection'

export async function migrateDatabase(sql: Sql, schema = 'app'): Promise<void> {
  await sql.unsafe(`create schema if not exists "${schema}"`)
  await sql.unsafe(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'))
}
