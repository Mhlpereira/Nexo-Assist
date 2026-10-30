import { redirect } from 'next/navigation'
import { ProfileView } from '@/components/chat/profile-view'
import { currentSession } from '@/server/session'

export default async function ProfilePage() {
  const session = await currentSession()
  if (!session || session.role !== 'employee') redirect('/login')
  return <ProfileView user={{ name: session.name, email: session.email }} />
}
