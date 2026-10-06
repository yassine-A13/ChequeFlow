import { createHmac, randomInt } from 'node:crypto'
import { prisma } from '../lib/prisma'

export function hashOtpCode(code: string) {
  const secret = process.env.OTP_HMAC_SECRET
  if (!secret || secret.length < 32) throw new Error('OTP_HMAC_SECRET must contain at least 32 characters.')
  return createHmac('sha256', secret).update(code).digest('hex')
}

/** Provider boundary for SMS delivery; credentials and transport remain server-side. */
export class OtpService {
  static async send(phone: string, userId?: string) {
    const endpoint = process.env.SMS_PROVIDER_URL
    if (!endpoint) throw new Error('SMS provider is not configured (SMS_PROVIDER_URL).')
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0')
    const codeHash = hashOtpCode(code)
    await prisma.phoneOtp.deleteMany({ where: { phone } })
    await prisma.phoneOtp.create({ data: { phone, userId, codeHash, expires: new Date(Date.now() + 5 * 60_000) } })
    try {
      const response = await fetch(endpoint, { method: 'POST', signal: AbortSignal.timeout(8000), headers: { 'content-type': 'application/json', ...(process.env.SMS_PROVIDER_TOKEN ? { authorization: `Bearer ${process.env.SMS_PROVIDER_TOKEN}` } : {}) }, body: JSON.stringify({ to: phone, message: `Votre code ChequeFlow : ${code}` }) })
      if (!response.ok) throw new Error('SMS provider rejected the OTP request.')
    } catch (error) {
      await prisma.phoneOtp.deleteMany({ where: { phone } })
      throw error
    }
  }
}
