import { describe, expect, it } from 'vitest'
import { ANA, inMemoryUsers } from '../testing/fakes'
import { createLogin } from './login.use-case'

describe('Login', () => {
  it('REQ-AUTH-01: aceita e-mail cadastrado com qualquer senha', async () => {
    const login = createLogin(inMemoryUsers())
    expect((await login.execute(' Ana.Souza@nexo.com.br ', 'qualquer')).ok).toBe(true)
  })

  it('REQ-AUTH-02: recusa e-mail desconhecido ou senha vazia com o mesmo erro', async () => {
    const login = createLogin(inMemoryUsers())
    expect(await login.execute('ninguem@nexo.com.br', 'senha')).toEqual({ ok: false, error: 'invalid_credentials' })
    expect(await login.execute(ANA.email, '')).toEqual({ ok: false, error: 'invalid_credentials' })
  })
})
