import { PrismaNeon } from '@prisma/adapter-neon'
import { PrismaClient } from '../../generated/prisma/client'

if (typeof window !== 'undefined') {
  throw new Error('The Prisma client is server-only and must not be imported by browser code.')
}

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient
}

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL is required by the server to connect to Neon.')
  }

  const adapter = new PrismaNeon({ connectionString })
  return new PrismaClient({ adapter })
}

/** Reused across hot reloads and warm Vercel function instances. */
export const prisma = globalForPrisma.prisma ?? createPrismaClient()
globalForPrisma.prisma = prisma
