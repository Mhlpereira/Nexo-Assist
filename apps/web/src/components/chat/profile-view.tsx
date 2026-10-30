'use client'

import { KeyRound, Lock, Mail, RotateCcwKey } from 'lucide-react'
import { useState } from 'react'
import { EmployeeShell } from './employee-shell'

export function ProfileView({ user }: { user: { name: string; email: string } }) {
  const [resetRequested, setResetRequested] = useState(false)
  return (
    <EmployeeShell user={user} active="profile">
      <div className="flex-1 overflow-y-auto px-4 py-12 md:px-10">
        <div className="mx-auto flex max-w-[560px] flex-col gap-8">
          <div className="flex flex-col gap-2">
            <h1 className="font-display text-[34px] leading-tight tracking-[-0.6px] text-ink">Meu perfil</h1>
            <p className="text-[15px] text-ink-3">Seus dados de acesso ao service desk de TI.</p>
          </div>
          <dl className="flex flex-col gap-5 rounded-2xl border border-rule p-5">
            <div className="flex flex-col gap-1">
              <dt className="text-[12.5px] text-ink-3">Nome</dt>
              <dd className="text-[15px] font-medium text-ink">{user.name}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-[12.5px] text-ink-3">E-mail corporativo</dt>
              <dd className="text-[15px] font-medium text-ink">{user.email}</dd>
              <dd className="flex items-center gap-1.5 text-[12.5px] text-ink-3">
                <Lock size={12} /> Gerenciado pela TI
              </dd>
            </div>
          </dl>
          <div className="flex flex-col gap-3 rounded-2xl border border-rule p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-desk text-ink-2">
                <KeyRound size={18} />
              </span>
              <div className="flex-1">
                <div className="text-[15px] font-semibold text-ink">Senha</div>
                <div className="text-[12.5px] text-ink-3">Alterada há 42 dias</div>
              </div>
              <button
                type="button"
                onClick={() => setResetRequested(true)}
                className="flex h-9 items-center gap-2 rounded-lg border border-ink/[0.12] px-3 text-[13.5px] font-medium text-ink hover:bg-desk"
              >
                <RotateCcwKey size={15} /> Redefinir senha
              </button>
            </div>
            <p className="flex items-center gap-1.5 text-[12.5px] text-ink-3">
              <Mail size={12} />
              {resetRequested ? `Link de redefinição enviado para ${user.email} (simulado).` : `Enviaremos um link de redefinição para ${user.email}.`}
            </p>
          </div>
        </div>
      </div>
    </EmployeeShell>
  )
}
