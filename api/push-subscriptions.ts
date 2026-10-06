import type { IncomingMessage, ServerResponse } from 'node:http'
import { getSession } from './lib/neon-auth'
import { isJsonRequest, isSameOriginRequest } from '../src/services/request-security.service'
import { prisma } from '../src/lib/prisma'

type Request = IncomingMessage & { body?: unknown; url?: string }
type Response = ServerResponse & { status?: (code: number) => Response; json?: (body: unknown) => void }

function sendJson(res: Response, status: number, data: unknown) {
  res.statusCode = status
  res.setHeader('Cache-Control', 'no-store')
  if (res.status) res.status(status)
  if (res.json) res.json(data)
  else { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)) }
}

function readPayload(body: unknown): { endpoint: string; p256dh?: string; auth?: string } | null {
  if (!body || typeof body !== 'object') return null
  const value = body as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }
  if (typeof value.endpoint !== 'string' || value.endpoint.length > 4096) return null
  try { if (new URL(value.endpoint).protocol !== 'https:') return null } catch { return null }
  if (value.keys === undefined) return { endpoint: value.endpoint }
  if (typeof value.keys.p256dh !== 'string' || typeof value.keys.auth !== 'string' || !value.keys.p256dh || !value.keys.auth) return null
  return { endpoint: value.endpoint, p256dh: value.keys.p256dh, auth: value.keys.auth }
}

export default async function handler(req: Request, res: Response) {
  if (!['GET', 'POST', 'DELETE'].includes(req.method ?? '')) {
    res.setHeader('Allow', 'GET, POST, DELETE')
    return sendJson(res, 405, { error: 'Méthode non autorisée.' })
  }
  const user = await getSession(req)
  if (!user) return sendJson(res, 401, { error: 'Connexion requise.' })

  if (req.method === 'GET') {
    const publicKey = process.env.VAPID_PUBLIC_KEY
    if (!publicKey) return sendJson(res, 503, { error: 'Les notifications push ne sont pas configurées.' })
    const url = new URL(req.url ?? '/api/push-subscriptions', process.env.APP_URL ?? 'http://localhost')
    const endpoint = url.searchParams.get('endpoint')
    const subscription = endpoint
      ? await prisma.pushSubscription.findFirst({ where: { userId: user.id, endpoint }, select: { id: true } })
      : null
    return sendJson(res, 200, { publicKey, enabled: Boolean(subscription) })
  }

  if (!isSameOriginRequest(req)) return sendJson(res, 403, { error: 'Origine de requête invalide.' })
  if (!isJsonRequest(req)) return sendJson(res, 415, { error: 'Le contenu doit être au format JSON.' })
  const input = readPayload(req.body)
  if (!input) return sendJson(res, 400, { error: 'Abonnement push invalide.' })

  try {
    if (req.method === 'DELETE') {
      await prisma.pushSubscription.deleteMany({ where: { userId: user.id, endpoint: input.endpoint } })
      return sendJson(res, 200, { ok: true })
    }
    if (!input.p256dh || !input.auth) return sendJson(res, 400, { error: 'Clés d’abonnement manquantes.' })
    const existing = await prisma.pushSubscription.findUnique({ where: { endpoint: input.endpoint } })
    if (existing && existing.userId !== user.id) return sendJson(res, 409, { error: 'Cet abonnement est déjà associé à un autre compte.' })
    if (existing) {
      await prisma.pushSubscription.update({ where: { id: existing.id }, data: { p256dh: input.p256dh, auth: input.auth } })
    } else {
      await prisma.pushSubscription.create({ data: { userId: user.id, endpoint: input.endpoint, p256dh: input.p256dh, auth: input.auth } })
    }
    return sendJson(res, 201, { ok: true })
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      return sendJson(res, 409, { error: 'Cet abonnement est déjà associé à un autre compte.' })
    }
    console.error('Push subscription request failed', error instanceof Error ? error.name : 'unknown')
    return sendJson(res, 500, { error: 'Impossible d’enregistrer l’abonnement push.' })
  }
}
