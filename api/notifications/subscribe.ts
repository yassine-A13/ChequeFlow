import type { IncomingMessage, ServerResponse } from 'node:http'
import { getSession } from '../lib/neon-auth'
import { isJsonRequest, isSameOriginRequest } from '../../src/services/request-security.service'
import { prisma } from '../../src/lib/prisma'

type Request = IncomingMessage & { body?: unknown }
type Response = ServerResponse & { status?: (code: number) => Response; json?: (body: unknown) => void }
type SubscriptionInput = { endpoint: string; p256dh?: string; auth?: string }

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

function parseSubscription(body: unknown): SubscriptionInput | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const value = body as { endpoint?: unknown; keys?: unknown }
  if (typeof value.endpoint !== 'string' || value.endpoint.length === 0 || value.endpoint.length > 4096) return null
  try {
    const endpoint = new URL(value.endpoint)
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password) return null
  } catch {
    return null
  }

  if (!value.keys || typeof value.keys !== 'object' || Array.isArray(value.keys)) return { endpoint: value.endpoint }
  const keys = value.keys as { p256dh?: unknown; auth?: unknown }
  if (
    typeof keys.p256dh !== 'string' || !/^[A-Za-z0-9_-]{20,200}$/.test(keys.p256dh)
    || typeof keys.auth !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(keys.auth)
  ) return null
  return { endpoint: value.endpoint, p256dh: keys.p256dh, auth: keys.auth }
}

function isPrismaUniqueViolation(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002')
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    res.setHeader('Allow', 'POST, DELETE')
    return sendJson(res, 405, { error: 'Méthode non autorisée.' })
  }

  const user = await getSession(req)
  if (!user) return sendJson(res, 401, { error: 'Connexion requise.' })
  if (!isSameOriginRequest(req)) return sendJson(res, 403, { error: 'Origine de requête invalide.' })
  if (!isJsonRequest(req)) return sendJson(res, 415, { error: 'Le contenu doit être au format JSON.' })

  const input = parseSubscription(req.body)
  if (!input) return sendJson(res, 400, { error: 'Abonnement push invalide.' })

  try {
    if (req.method === 'DELETE') {
      await prisma.pushSubscription.deleteMany({ where: { userId: user.id, endpoint: input.endpoint } })
      return sendJson(res, 200, { ok: true })
    }

    if (!input.p256dh || !input.auth) return sendJson(res, 400, { error: 'Clés d’abonnement manquantes.' })
    const existing = await prisma.pushSubscription.findUnique({ where: { endpoint: input.endpoint } })
    if (existing && existing.userId !== user.id) {
      return sendJson(res, 409, { error: 'Cet abonnement est déjà associé à un autre compte.' })
    }
    if (existing) {
      await prisma.pushSubscription.update({
        where: { id: existing.id },
        data: { p256dh: input.p256dh, auth: input.auth },
      })
      return sendJson(res, 200, { ok: true })
    }

    await prisma.pushSubscription.create({
      data: { userId: user.id, endpoint: input.endpoint, p256dh: input.p256dh, auth: input.auth },
    })
    return sendJson(res, 201, { ok: true })
  } catch (error) {
    if (isPrismaUniqueViolation(error)) {
      const racedSubscription = await prisma.pushSubscription.findUnique({ where: { endpoint: input.endpoint } })
      if (racedSubscription?.userId === user.id) return sendJson(res, 200, { ok: true })
      return sendJson(res, 409, { error: 'Cet abonnement est déjà associé à un autre compte.' })
    }
    console.error('Push subscription request failed', error instanceof Error ? error.name : 'unknown')
    return sendJson(res, 500, { error: 'Impossible de traiter l’abonnement push.' })
  }
}
