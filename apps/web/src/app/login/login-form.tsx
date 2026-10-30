'use client'

import { ArrowRight, Check, Eye, EyeOff, Loader2, LockKeyhole, Mail } from 'lucide-react'
import { useState } from 'react'

const DEMO_ACCOUNTS = [
  { email: 'ana.souza@nexo.com.br', label: 'Ana Souza · funcionária (chamado vencido)' },
  { email: 'bruno.tavares@nexo.com.br', label: 'Bruno Tavares · funcionário' },
  { email: 'rafael.lima@nexo.com.br', label: 'Rafael Lima · analista N2 (console)' },
]

export function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const body: { redirectTo?: string; message?: string } = await response.json()
      if (!response.ok || !body.redirectTo) {
        setError(body.message ?? 'E-mail ou senha inválidos.')
        return
      }
      window.location.assign(body.redirectTo)
    } catch {
      setError('Sem conexão com o servidor. Tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex w-full max-w-[380px] flex-col gap-7">
      <div className="flex flex-col gap-2">
        <h2 className="font-display text-[40px] leading-[1.1] tracking-[-0.8px] text-ink">Entrar</h2>
        <p className="text-[15.5px] leading-[1.5] text-ink-3">Use seu e-mail corporativo e a senha da rede Nexo.</p>
      </div>

      <div className="flex flex-col gap-[18px]">
        <label className="flex flex-col gap-2">
          <span className="text-[13.5px] font-medium text-ink">E-mail corporativo</span>
          <span className="flex h-11 items-center gap-2.5 rounded-lg border border-ink/[0.12] bg-paper pr-2 pl-3.5 shadow-[0_1px_2px_rgba(27,36,49,0.04)] focus-within:border-cta focus-within:ring-1 focus-within:ring-cta">
            <Mail size={16} className="text-ink-3" />
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="nome.sobrenome@nexo.com.br"
              className="flex-1 bg-transparent text-[14.5px] text-ink outline-none placeholder:text-ink-3"
            />
          </span>
        </label>

        <label className="flex flex-col gap-2">
          <span className="flex items-center justify-between">
            <span className="text-[13.5px] font-medium text-ink">Senha</span>
            <span className="text-[13.5px] font-medium text-primary-text">Esqueci minha senha</span>
          </span>
          <span className="flex h-11 items-center gap-2.5 rounded-lg border border-ink/[0.12] bg-paper pr-2 pl-3.5 focus-within:border-cta focus-within:ring-1 focus-within:ring-cta">
            <LockKeyhole size={16} className="text-ink-3" />
            <input
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="flex-1 bg-transparent text-[14.5px] text-ink outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              className="flex h-[30px] w-[30px] items-center justify-center rounded-md text-ink-3 hover:bg-desk"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </span>
        </label>

        <label className="flex items-center gap-2.5 pt-0.5 text-[13.5px] text-ink-2">
          <span className="flex h-[18px] w-[18px] items-center justify-center rounded-md bg-cta">
            <Check size={12} className="text-white" />
          </span>
          Manter conectado neste computador
        </label>
      </div>

      {error && (
        <p role="alert" className="-mt-3 rounded-lg bg-danger-soft px-3 py-2 text-[13.5px] text-danger-text">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="flex h-11 items-center justify-center gap-2 rounded-lg bg-cta text-[15.5px] font-semibold text-white shadow-[0_1px_2px_rgba(0,98,196,0.2),0_4px_12px_rgba(0,98,196,0.15)] transition hover:brightness-110 disabled:opacity-70"
      >
        {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
        Entrar
        {!submitting && <ArrowRight size={16} />}
      </button>

      <div className="flex flex-col gap-2 border-t border-rule pt-4 text-[12.5px] text-ink-3">
        <span>Ambiente de demonstração: qualquer senha funciona.</span>
        <div className="flex flex-col gap-1">
          {DEMO_ACCOUNTS.map((account) => (
            <button
              key={account.email}
              type="button"
              onClick={() => {
                setEmail(account.email)
                setPassword('demo')
              }}
              className="text-left text-primary-text hover:underline"
            >
              {account.label}
            </button>
          ))}
        </div>
      </div>
    </form>
  )
}
