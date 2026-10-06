import type { IncomingMessage, ServerResponse } from 'node:http'
import { getSession } from '../lib/neon-auth'
import { getResendClient, getResendFromEmail } from '../lib/resend'
import { isJsonRequest, isSameOriginRequest } from '../../src/services/request-security.service'

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

export default async function handler(req: IncomingMessage, res: Response) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return sendJson(res, 405, { error: 'Méthode non autorisée.' })
  }

  const user = await getSession(req)
  if (!user) return sendJson(res, 401, { error: 'Connexion requise.' })
  if (!isSameOriginRequest(req)) return sendJson(res, 403, { error: 'Origine de requête invalide.' })
  if (!isJsonRequest(req)) return sendJson(res, 415, { error: 'Le contenu doit être au format JSON.' })
  if (!user.email) return sendJson(res, 400, { error: 'Aucune adresse e-mail n’est associée à ce compte.' })

  try {
    const { data, error } = await getResendClient().emails.send({
      from: getResendFromEmail(),
      to: [user.email],
      subject: '🔔 ChequeFlow — Test',
      html: '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:24px;background:#f3f5f7;font-family:Arial,Helvetica,sans-serif;color:#182230"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:24px auto;background:#fff;border:1px solid #e5e9ef;border-radius:12px"><tr><td style="padding:32px"><p style="margin:0 0 18px;color:#246b55;font-size:13px;font-weight:700;letter-spacing:.3px">CHEQUEFLOW</p><h1 style="margin:0 0 14px;font-size:24px;line-height:1.3">Test des notifications email</h1><p style="margin:0;color:#475467;font-size:16px;line-height:1.6">Les notifications email fonctionnent correctement !</p></td></tr></table></body></html>',
      text: 'Les notifications email fonctionnent correctement !',
    })

    if (error) {
      console.error('Resend test email failed:', error.name ?? 'unknown')
      return sendJson(res, 502, { error: 'Resend n’a pas pu envoyer l’email de test.' })
    }
    return sendJson(res, 200, { ok: true, id: data?.id })
  } catch (error) {
    console.error('Test email request failed:', error instanceof Error ? error.name : 'unknown')
    return sendJson(res, 503, { error: 'Le service email est indisponible. Vérifiez sa configuration serveur.' })
  }
}
