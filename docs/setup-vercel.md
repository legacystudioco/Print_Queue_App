# Vercel Deployment

## 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin git@github.com:<you>/print-queue-app.git
git push -u origin main
```

## 2. Import into Vercel

1. [vercel.com/new](https://vercel.com/new) → Import the GitHub repository.
2. **Root Directory**: set to `apps/web` (this is a monorepo — Vercel
   needs to know where the Next.js app actually lives).
3. **Framework Preset**: Next.js (should auto-detect once the root
   directory is set).
4. **Build Command**: leave as default (`next build`) — or, since Turborepo
   is set up, `cd ../.. && pnpm turbo run build --filter=web` also works
   and gets you Turborepo's caching. Simplest is fine for a low-traffic app.
5. **Install Command**: `pnpm install` (Vercel auto-detects pnpm from
   `pnpm-lock.yaml` at the repo root; no change usually needed).

## 3. Environment variables

In Project Settings → Environment Variables, add (for Production, and
Preview if you want preview deployments to work too):

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | from Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same page |
| `SUPABASE_SERVICE_ROLE_KEY` | same page — **mark as sensitive**, never log it |
| `APP_URL` | your Vercel deployment URL, e.g. `https://print-queue.vercel.app` |

Never add these with `NEXT_PUBLIC_` prefix on the service role key — that
would ship it to every browser.

## 4. Deploy

Click Deploy. Vercel will build and give you a URL.

## 5. Verify

- Visit the URL, confirm you land on `/login` (not a public sign-up page).
- Log in with the admin account created in `docs/setup-supabase.md`.
- Confirm the dashboard loads (it will show "no printer configured" or
  similar until the bridge is running — that's expected at this point).
- As admin, upload a small test file via **Add Print** and confirm it
  appears in **Queue** — this exercises the direct-to-Supabase-Storage
  upload path and the service-role job-creation route together.
- Log out, log back in as the operator account, confirm role-appropriate
  screens/actions (no Add Print link, etc.).

## Notes on the monorepo build

Because `apps/web` depends on `@print-queue/shared` (a workspace package
with its own build step via `tsup`), make sure Turborepo's dependency graph
runs it first. This is already wired: `turbo.json`'s `build` task has
`"dependsOn": ["^build"]`, so `packages/shared` builds before `apps/web`
whenever Vercel runs `pnpm turbo run build --filter=web` (or Vercel's
default Next.js build detection, which also invokes the root `build`
script via the detected monorepo settings). If you ever see a "Cannot find
module '@print-queue/shared'" error on Vercel, double check the Root
Directory setting and that the install step ran at the repo root (Vercel
does this automatically for detected monorepos).
