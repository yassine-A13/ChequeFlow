import type { IncomingMessage } from 'node:http'

export function isSameOriginRequest(req: IncomingMessage) {
  const origin = req.headers.origin
  if (typeof origin !== 'string') return false
  const protoHeader = req.headers['x-forwarded-proto']
  const proto = typeof protoHeader === 'string' ? protoHeader.split(',')[0].trim() : 'http'
  const expected = process.env.APP_URL ?? `${proto}://${req.headers.host ?? ''}`
  try { return new URL(origin).origin === new URL(expected).origin } catch { return false }
}

export function isJsonRequest(req: IncomingMessage) {
  const contentType = req.headers['content-type']
  return typeof contentType === 'string' && contentType.split(';')[0].trim().toLowerCase() === 'application/json'
}
