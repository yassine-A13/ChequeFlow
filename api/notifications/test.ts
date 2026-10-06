import type { IncomingMessage, ServerResponse } from 'node:http'
import webpush from 'web-push'
import { getSession } from '../lib/neon-auth'
import { isJsonRequest, isSameOriginRequest } from '../../src/services/request-security.service'
import { prisma } from '../../src/lib/prisma'

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

function getPushStatus(error: unknown) {
  if (!error || typeof error !== 'object' || !('statusCode' in error)) return null
  const statusCode = error.statusCode
  return typeof statusCode === 'number' ? statusCode : null
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

  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT
  if (!publicKey || !privateKey || !subject) {
    return sendJson(res, 503, { error: 'Les notifications push ne sont pas configurées sur le serveur.' })
  }

  try {
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId: user.id },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    })
    if (!subscriptions.length) return sendJson(res, 404, { error: 'Aucun abonnement push actif pour ce compte.' })

    webpush.setVapidDetails(subject, publicKey, privateKey)
    const payload = JSON.stringify({
      title: 'ChequeFlow',
      body: 'Les notifications fonctionnent correctement !',
    })
    const results = await Promise.all(subscriptions.map(async subscription => {
      try {
        await webpush.sendNotification({
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        }, payload)
        return 'sent' as const
      } catch (error) {
        const status = getPushStatus(error)
        if (status === 404 || status === 410) {
          await prisma.pushSubscription.deleteMany({ where: { id: subscription.id, userId: user.id } })
          return 'expired' as const
        }
        console.error('Web Push test send failed', status ?? (error instanceof Error ? error.name : 'unknown'))
        return 'failed' as const
      }
    }))

    const sent = results.filter(result => result === 'sent').length
    const expired = results.filter(result => result === 'expired').length
    const failed = results.filter(result => result === 'failed').length
    if (sent > 0) return sendJson(res, 200, { ok: true, sent })
    if (expired === subscriptions.length) {
      return sendJson(res, 410, { error: 'L’abonnement push a expiré. Désactivez puis réactivez les notifications.' })
    }
    return sendJson(res, 502, { error: 'Le service push n’a pas accepté la notification de test.', failed, expired })
  } catch (error) {
    console.error('Push test request failed', error instanceof Error ? error.name : 'unknown')
    return sendJson(res, 500, { error: 'Impossible d’envoyer la notification de test.' })
  }
}
