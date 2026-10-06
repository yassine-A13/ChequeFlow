import type { IncomingMessage, ServerResponse } from 'node:http'
import { getSession } from './lib/neon-auth'
import { getDashboardData } from '../src/services/dashboard.service'

type Request = IncomingMessage
type Response = ServerResponse & { status?: (code: number) => Response; json?: (body: unknown) => void }

function respond(res: Response, status: number, data: unknown) {
  res.statusCode = status
  res.setHeader('Cache-Control', 'no-store')
  if (res.json) res.json(data)
  else { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)) }
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return respond(res, 405, { error: 'Méthode non autorisée.' })
  }
  try {
    const user = await getSession(req)
    if (!user) return respond(res, 401, { error: 'Connexion requise.' })
    const dashboard = await getDashboardData({ userId: user.id })
    return respond(res, 200, dashboard)
  } catch (error) {
    console.error('Dashboard request failed', error instanceof Error ? error.name : 'unknown')
    return respond(res, 500, { error: 'Le tableau de bord est momentanément indisponible.' })
  }
}
