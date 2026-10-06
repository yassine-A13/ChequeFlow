import { prisma } from '../src/lib/prisma'

/** Public infrastructure probe; it returns no database URL, query result, or account data. */
export async function GET(): Promise<Response> {
  try {
    await prisma.$queryRaw`SELECT 1`
    return Response.json({ status: 'ok', database: 'connected' })
  } catch {
    return Response.json({ status: 'unavailable', database: 'disconnected' }, { status: 503 })
  }
}
