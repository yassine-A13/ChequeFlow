import type { IncomingMessage, ServerResponse } from 'node:http'
import { getSession } from '../lib/neon-auth'
import { isJsonRequest, isSameOriginRequest } from '../../src/services/request-security.service'
import { checkUpcomingChequeReminders } from '../../src/services/notification.service'

type Request = IncomingMessage
type Response = ServerResponse & { status?: (code: number) => Response; json?: (body: unknown) => void }

function sendJson(res: Response, status: number, data: unknown) {
  res.statusCode = status
  res.setHeader('Cache-Control', 'no-store')
  if (res.status) res.status(status)
  if (res.json) res.json(data)
  else {
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(data))
  }
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return sendJson(res, 405, { error: 'Méthode non autorisée.' })
  }

  const user = await getSession(req)
  if (!user) return sendJson(res, 401, { error: 'Connexion requise.' })
  if (!isSameOriginRequest(req)) return sendJson(res, 403, { error: 'Origine de requête invalide.' })
  if (!isJsonRequest(req)) return sendJson(res, 415, { error: 'Le contenu doit être au format JSON.' })

  try {
    const reminders = await checkUpcomingChequeReminders({ userId: user.id })
    return sendJson(res, 200, { reminders })
  } catch (error) {
    console.error('Upcoming cheque reminder check failed', error instanceof Error ? error.name : 'unknown')
    return sendJson(res, 500, { error: 'Impossible de vérifier les chèques à échéance.' })
  }
}
