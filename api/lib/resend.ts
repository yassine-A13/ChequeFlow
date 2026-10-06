import { Resend } from 'resend'

if (typeof window !== 'undefined') {
  throw new Error('Resend is server-only and must not be imported by browser code.')
}

let resendClient: Resend | undefined

/** Lazily creates the server-side Resend client from the private environment key. */
export function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (!apiKey) throw new Error('RESEND_API_KEY is required by the server.')
  resendClient ??= new Resend(apiKey)
  return resendClient
}

/** Sender address configured only in the server environment. */
export function getResendFromEmail() {
  const fromEmail = process.env.RESEND_FROM_EMAIL?.trim()
  if (!fromEmail) throw new Error('RESEND_FROM_EMAIL is required by the server.')
  return fromEmail
}
