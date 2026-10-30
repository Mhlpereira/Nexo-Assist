import { existsSync } from 'node:fs'
import type { NextConfig } from 'next'

const rootEnvironmentFile = new URL('../../.env', import.meta.url)
if (existsSync(rootEnvironmentFile)) process.loadEnvFile(rootEnvironmentFile)

const nextConfig: NextConfig = {
  transpilePackages: ['@nexo/core', '@nexo/infra'],
  serverExternalPackages: ['postgres', '@mastra/core'],
  agentRules: false,
  devIndicators: false,
}

export default nextConfig
