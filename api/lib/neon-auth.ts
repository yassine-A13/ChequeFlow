import type { IncomingMessage } from 'node:http'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { prisma } from '../../src/lib/prisma'

type AuthenticatedUser = NonNullable<Awaited<ReturnType<typeof prisma.user.findUnique>>>

const authUrl = process.env.NEON_AUTH_BASE_URL ?? process.env.VITE_NEON_AUTH_URL
const jwksUrl = process.env.NEON_AUTH_JWKS_URL ?? (authUrl ? `${authUrl.replace(/\/$/, '')}/.well-known/jwks.json` : undefined)
// Managed Neon Auth tokens use the auth service origin as `iss`, not the
// database/auth path in NEON_AUTH_BASE_URL (for example, `https://...neon.tech`).
const issuer = authUrl ? new URL(authUrl).origin : undefined
let remoteJwks: ReturnType<typeof createRemoteJWKSet> | undefined

function bearerToken(req: IncomingMessage) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) return null
  const token = header.slice('Bearer '.length).trim()
  return token || null
}

async function mapNeonUserToApplicationUser(subject: string, claims: Record<string, unknown>): Promise<AuthenticatedUser> {
  const provider = 'neon-auth'
  const accountWhere = { provider_providerAccountId: { provider, providerAccountId: subject } }
  const linked = await prisma.account.findUnique({ where: accountWhere, include: { user: true } })
  if (linked) return linked.user

  const email = typeof claims.email === 'string' ? claims.email.toLowerCase() : null
  const verifiedEmail = claims.email_verified === true
  const name = typeof claims.name === 'string' ? claims.name.slice(0, 120) : null
  const image = typeof claims.picture === 'string' && claims.picture.startsWith('https://') ? claims.picture : null

  try {
    return await prisma.$transaction(async tx => {
      const concurrentLink = await tx.account.findUnique({ where: accountWhere, include: { user: true } })
      if (concurrentLink) return concurrentLink.user

      const userByVerifiedEmail = verifiedEmail && email
        ? await tx.user.findUnique({ where: { email } })
        : null
      const user = userByVerifiedEmail
        ? await tx.user.update({
            where: { id: userByVerifiedEmail.id },
            data: { name: name ?? userByVerifiedEmail.name, image: image ?? userByVerifiedEmail.image, emailVerified: userByVerifiedEmail.emailVerified ?? new Date() },
          })
        : await tx.user.create({ data: { email, name, image, emailVerified: verifiedEmail ? new Date() : null } })

      await tx.account.create({ data: { userId: user.id, type: 'oauth', provider, providerAccountId: subject } })
      return user
    })
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      const racedLink = await prisma.account.findUnique({ where: accountWhere, include: { user: true } })
      if (racedLink) return racedLink.user
    }
    throw error
  }
}

/** Returns an application user only after verifying the Neon Auth bearer JWT. */
export async function getSession(req: IncomingMessage): Promise<AuthenticatedUser | null> {
  const token = bearerToken(req)
  if (!token || !authUrl || !jwksUrl || !issuer) return null

  try {
    remoteJwks ??= createRemoteJWKSet(new URL(jwksUrl))
    const { payload } = await jwtVerify(token, remoteJwks, { issuer })
    if (typeof payload.sub !== 'string' || !payload.sub) return null
    return await mapNeonUserToApplicationUser(payload.sub, payload)
  } catch (error) {
    console.warn('Neon Auth session verification failed:', error instanceof Error ? error.name : 'unknown')
    return null
  }
}
