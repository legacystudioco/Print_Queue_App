# Vercel Deployment

## Exact settings (quick reference)

| Setting | Value |
|---|---|
| Root Directory | `apps/web` |
| Framework Preset | Next.js (auto-detected) |
| Install Command | `pnpm install` (default) |
| Build Command | `next build` (default) — Turborepo's `dependsOn: ["^build"]` still builds `packages/shared` first because Vercel's monorepo detection runs the install/build at the repo root before invoking the app's build |
| Output | Default Next.js output (serverless functions for routes/middleware, static for prerendered pages) — no custom `vercel.json` needed |
| Node.js Version | Default (Vercel's current LTS) — no constraint; the one Node-version-sensitive fix in this codebase (`ws` transport for Supabase's Realtime client) only affects plain Node.js processes like the bridge, not the Next.js runtime Vercel uses |
| Production env vars | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `APP_URL` (set to the real production URL, not localhost) |
| Preview env vars | Same four, same values (or a separate Supabase project for previews, if you ever want that isolation — not necessary for this app's scale) |
| Bridge variables | **Never added to Vercel** — the bridge doesn't run there. See `docs/setup-bridge.md`. |

Everything below walks through getting to that state from scratch.

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
| `NEXT_PUBLIC_SUPABASE_URL` | from Supabase → Project Settings → API Keys (bare project origin, no path suffix) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | same page — publishable key |
| `SUPABASE_SECRET_KEY` | same page — secret key, **mark as sensitive**, never log it |
| `APP_URL` | your Vercel deployment URL, e.g. `https://print-queue.vercel.app` |

Never add the `NEXT_PUBLIC_` prefix to the secret key — that would ship it
to every browser. This project standardizes on Supabase's current
publishable/secret key naming rather than the legacy anon/service_role
names; see `docs/setup-supabase.md`.

## 4. Deploy

Click Deploy. Vercel will build and give you a URL.

## 5. Verify

- Visit the URL, confirm you land on `/login` (not a public sign-up page),
  and that it asks for a **Username** — not an email.
- Log in as `Tyler` (admin) with his real password — the internal
  `tyler@printqueue.local` address from `docs/setup-supabase.md` never
  appears anywhere in the UI.
- Confirm the dashboard loads (it will show "no printer configured" or
  "bridge offline" until the bridge is running at home — that's expected
  at this point).
- As admin, upload a small test file via **Add Print** and confirm it
  appears in **Queue** — this exercises the direct-to-Supabase-Storage
  upload path and the secret-key job-creation route together.
- Log out, log back in as `Harper` (operator), confirm role-appropriate
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
