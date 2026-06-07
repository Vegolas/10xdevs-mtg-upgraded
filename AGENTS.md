# Repository Guidelines

This is **10x Astro Starter** — an Astro 6 SSR app with React 19 islands, Tailwind 4, Supabase auth, and shadcn/ui, deployed to Cloudflare Workers. See `@README.md` for setup and `@CLAUDE.md.scaffold` for architecture depth.

## Hard rules

- `SUPABASE_URL` / `SUPABASE_KEY` are **server-only secrets**, declared in `astro.config.mjs` `env.schema` and read via `astro:env/server` (`@src/lib/supabase.ts`). Never import them client-side or via `import.meta.env`.
- The app runs `output: "server"` — every page is SSR by default. Any API route under `src/pages/api/` must export `const prerender = false`.
- Merge Tailwind classes with `cn()` from `@/lib/utils` (clsx + tailwind-merge). Do not concatenate class strings manually.
- React islands only: no Next.js directives (`"use client"` etc.). Use Astro components for static content/layout, React only where interactivity is required.
- New Supabase tables: enable RLS with granular per-operation, per-role policies. Migrations live in `supabase/migrations/` named `YYYYMMDDHHmmss_short_description.sql`.

## Project structure

- `src/pages/` — routes (`.astro`); auth pages under `src/pages/auth/`. `src/middleware.ts` resolves the user into `context.locals.user` and guards paths in its `PROTECTED_ROUTES` array.
- `src/components/` — `auth/` (React forms), `ui/` (shadcn, "new-york" variant; add via `npx shadcn@latest add <name>`), plus `.astro` components.
- `src/lib/` — services/helpers (`supabase.ts`, `utils.ts`, `config-status.ts`). `src/layouts/`, `src/styles/global.css`.
- Path alias `@/*` → `./src/*` (`@tsconfig.json`).

## Commands

- `npm run dev` — dev server (Cloudflare workerd runtime).
- `npm run build` / `npm run preview` — production build / preview.
- `npm run lint` / `npm run lint:fix` — ESLint (type-checked rules).
- `npm run format` — Prettier.

## Coding style

- TypeScript strict (`astro/tsconfigs/strict`); ESLint runs `strictTypeChecked` + `stylisticTypeChecked` (`@eslint.config.js`). `no-console` warns; prefix intentionally unused vars with `_`.
- Prettier enforces formatting (incl. astro + tailwind plugins). Pre-commit husky + lint-staged auto-fixes staged `*.{ts,tsx,astro}` and formats `*.{json,css,md}`.
- Node v22.14.0 (`.nvmrc`).

## CI

GitHub Actions (`@.github/workflows/ci.yml`) runs lint + build on every push and PR to `master`; needs `SUPABASE_URL` / `SUPABASE_KEY` repo secrets.
