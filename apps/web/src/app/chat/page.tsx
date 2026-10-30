import { redirect } from 'next/navigation'
import { ChatView } from '@/components/chat/chat-view'
import { currentSession } from '@/server/session'

export default async function ChatPage() {
  const session = await currentSession()
  if (!session || session.role !== 'employee') redirect('/login')
  return <ChatView user={{ name: session.name, email: session.email }} />
}
