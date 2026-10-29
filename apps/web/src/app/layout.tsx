import type { Metadata } from 'next'
import { IBM_Plex_Mono, Newsreader, Schibsted_Grotesk } from 'next/font/google'
import type { ReactNode } from 'react'
import './globals.css'

const schibsted = Schibsted_Grotesk({ subsets: ['latin'], variable: '--font-schibsted' })
const newsreader = Newsreader({ subsets: ['latin'], variable: '--font-newsreader' })
const plexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-plex-mono' })

export const metadata: Metadata = {
  title: 'Nexo Assist',
  description: 'Service desk de TI da Nexo',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={`${schibsted.variable} ${newsreader.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
