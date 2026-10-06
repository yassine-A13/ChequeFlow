# ChequeFlow

React, TypeScript and Vite frontend with a server-side Neon PostgreSQL and Prisma foundation for Vercel.

## Local setup

1. Copy `.env.example` to `.env` and fill in the Neon connection strings described in [backend architecture](docs/backend-architecture.md).
2. Install packages with `npm install` (the `postinstall` script runs `prisma generate`).
3. Apply the existing migration to the development database with `npx prisma migrate dev`.
4. Run `npm run dev` and open the local Vercel URL. This runs Vite together with the existing serverless functions in `api/`; running `npm run dev:vite` starts only Vite and cannot serve those functions.

Useful commands:

```sh
npm run db:validate
npm run db:generate
npm run db:migrate:dev -- --name describe_change
npm run db:migrate:deploy
npm run build
npm run lint
```

Set both server-only Neon variables in Vercel project settings. Do not use either variable in `VITE_*` names or browser code.

Cheque images use a **private Vercel Blob store**. Create a private Blob store and connect it to the Vercel project; Vercel supplies the server-side Blob credentials to deployed functions. For local development, set `BLOB_READ_WRITE_TOKEN` in `.env`. Image upload, replacement, preview and deletion run through authenticated server routes, and the Blob URL is stored in `Cheque.imageUrl`.
