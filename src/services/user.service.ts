import { prisma } from '../lib/prisma'
import type { AuthenticatedPrincipal } from '../types/authenticated-principal'

/** The principal must come from verified server-side authentication. */
export function getOwnUserProfile(principal: AuthenticatedPrincipal) {
  return prisma.user.findUnique({
    where: { id: principal.userId },
    select: { id: true, name: true, email: true, phone: true, image: true, createdAt: true, updatedAt: true },
  })
}
