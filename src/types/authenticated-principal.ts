/** Construct this only from a verified server-side session, never from request JSON. */
export interface AuthenticatedPrincipal {
  readonly userId: string
}
