import { connect, migrate } from './database'
import { environment } from './environment'
import { seed } from './seed'

const sql = connect(environment.DATABASE_URL)
await migrate(sql)
await seed(sql)
await sql.end()
console.log('tickets: schema e dados de exemplo prontos')
