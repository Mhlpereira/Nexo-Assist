import { redirect } from 'next/navigation'
import { ConsoleView } from '@/components/console/console-view'
import { currentSession } from '@/server/session'

export default async function ConsolePage() {
  const session = await currentSession()
  if (!session || session.role !== 'analyst') redirect('/login')
  return <ConsoleView analyst={{ id: session.sub, name: session.name }} />
}
