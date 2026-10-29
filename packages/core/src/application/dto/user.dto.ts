export interface User {
  id: string
  email: string
  name: string
  role: 'employee' | 'analyst'
  department: string
  team: string | null
}
