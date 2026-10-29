import postgres from 'postgres'

export type Sql = postgres.Sql

export const connectDatabase = (databaseUrl: string, schema = 'app'): Sql =>
  postgres(databaseUrl, { connection: { search_path: `${schema},public` }, transform: postgres.camel, onnotice: () => {} })

export const toJsonb = (value: unknown) => JSON.stringify(value)
