import { timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { checkUpcomingChequeReminders } from '../../src/services/notification.service'

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

function hasValidCronSecret(req: IncomingMessage, secret: string) {
  const authorization = req.headers.authorization
  if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) return false
  const provided = Buffer.from(authorization.slice('Bearer '.length))
  const expected = Buffer.from(secret)
  return provided.length === expected.length && timingSafeEqual(provided, expected)
}

export default async function handler(req: IncomingMessage, res: Response) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return sendJson(res, 405, { error: 'Méthode non autorisée.' })
  }

  const secret = process.env.CRON_SECRET
  if (!secret) return sendJson(res, 503, { error: 'Le Cron n’est pas configuré sur le serveur.' })
  if (!hasValidCronSecret(req, secret)) return sendJson(res, 401, { error: 'Non autorisé.' })

  try {
    const reminders = await checkUpcomingChequeReminders()
    const sent = reminders.filter(reminder => reminder.status === 'sent').length
    const failed = reminders.filter(reminder => reminder.status === 'failed').length
    return sendJson(res, 200, { ok: true, checked: reminders.length, sent, failed })
  } catch (error) {
    console.error('Scheduled cheque reminder check failed', error instanceof Error ? error.name : 'unknown')
    return sendJson(res, 500, { error: 'Impossible de vérifier les rappels à échéance.' })
  }
}
