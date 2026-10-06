# Backend architecture

## Neon and Prisma

- `DATABASE_URL` is the pooled Neon connection string (`-pooler` hostname) used at runtime by the Neon serverless driver adapter.
- `DIRECT_URL` is the direct Neon connection string used by Prisma CLI migrations. Set both as server-side environment variables in Vercel and keep them out of browser code and logs.
- Prisma Client is generated into the ignored `generated/prisma/` directory during `npm install` and by `npm run db:generate`.
- `src/lib/prisma.ts` caches one Prisma Client per Node.js process, including development hot reloads and warm Vercel function instances.
- Vercel deploys TypeScript functions from `api/`. `GET /api/health` performs a `SELECT 1` probe and returns no connection details.

## Schema and ownership

Neon Auth is the sole authentication provider. The React app creates one Neon Auth client; it uses that client for `useSession`, sign-in, sign-out, and retrieval of the Neon JWT attached to same-origin API requests. `api/lib/neon-auth.ts` verifies each bearer JWT against the branch JWKS and expected issuer before resolving the corresponding application user. The first verified request links the Neon subject to an application `User` through the existing `Account` table; this mapping preserves the UUID foreign keys used by cheque data and does not create an application session or store auth credentials. Never accept a client-supplied `userId`.

Every protected service accepts an `AuthenticatedPrincipal` constructed from that verified Neon identity. Keep each database operation scoped to its returned user ID. The Neon Auth URL is public configuration; its JWKS URL is also public and can be supplied as `NEON_AUTH_JWKS_URL` (otherwise it is derived from the auth URL). No Google OAuth secret belongs in this application or its browser bundle; Google OAuth is configured in Neon Auth.

Cheque amount positivity and `dueDate >= issueDate` are enforced by named PostgreSQL `CHECK` constraints in the initial migration. Prisma Schema Language does not model these checks, so preserve them in subsequent migrations.

## Migrations

The initial SQL was generated from the Prisma schema using `prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`, then extended with the two database checks above. It has not been applied: no Neon credentials were provided.

For local development, set the Neon variables and run:

```sh
npx prisma migrate dev
npx prisma migrate dev --name describe_change
npx prisma generate
```

For a deployment, commit the migration and run `npx prisma migrate deploy` through the deployment pipeline. The authentication migration adds `password_hash`, password reset tokens and OTP records. Do not run ad hoc SQL against production.

## File storage

`src/services/file-storage.service.ts` defines a provider-neutral `FileStorageService` boundary. It has no provider implementation or credentials yet. A future Vercel Blob adapter should only be called from authenticated server functions and should build object keys from the authenticated user ID.
