'use client'

import { ChevronRight, LogOut, MessageSquare, UserRound } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { logout } from '@/lib/chat-api'
import { Avatar } from '../ui/avatar'
import { BrandMark } from '../ui/brand-mark'

interface EmployeeShellProps {
  user: { name: string; email: string }
  active: 'chat' | 'profile'
  status?: ReactNode
  children: ReactNode
}

const NAV = [
  { key: 'chat', href: '/chat', label: 'Atendimento', icon: MessageSquare },
  { key: 'profile', href: '/perfil', label: 'Meu perfil', icon: UserRound },
] as const

export function EmployeeShell({ user, active, status, children }: EmployeeShellProps) {
  return (
    <div className="flex h-dvh bg-paper">
      <aside className="hidden w-[232px] shrink-0 flex-col border-r border-rule px-3.5 pt-5 pb-3.5 md:flex">
        <div className="flex items-center gap-2.5 px-2 text-ink">
          <BrandMark size={20} />
          <span className="text-[16px] font-bold tracking-[-0.2px]">Nexo Assist</span>
        </div>
        <nav className="mt-[22px] flex flex-col gap-0.5">
          {NAV.map((item) => {
            const selected = item.key === active
            const Icon = item.icon
            return (
              <Link
                key={item.key}
                href={item.href}
                className={`flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] transition ${
                  selected ? 'bg-primary-soft font-semibold text-primary-text' : 'font-medium text-ink-2 hover:bg-desk'
                }`}
              >
                <Icon size={16} className={selected ? 'text-primary-text' : 'text-ink-3'} />
                {item.label}
              </Link>
            )
          })}
        </nav>
        <div className="flex-1" />
        <div className="flex items-center gap-2.5 border-t border-rule px-2 pt-3.5 pb-1">
          <Avatar name={user.name} />
          <div className="min-w-0">
            <div className="truncate text-[13.5px] font-semibold text-ink">{user.name}</div>
            <div className="truncate text-[11.5px] text-ink-3">{user.email}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={logout}
          className="mt-1 flex h-[34px] items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] font-medium text-ink-2 transition hover:bg-desk"
        >
          <LogOut size={16} className="text-ink-3" />
          Sair
        </button>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-4 border-b border-rule px-4 md:px-8">
          <div className="flex flex-1 items-center gap-2 text-[13.5px]">
            <span className="text-ink-3">Service desk de TI</span>
            <ChevronRight size={14} className="text-ink-3" />
            <span className="font-semibold text-ink">{active === 'chat' ? 'Atendimento' : 'Meu perfil'}</span>
          </div>
          {status}
        </header>
        {children}
      </main>
    </div>
  )
}
