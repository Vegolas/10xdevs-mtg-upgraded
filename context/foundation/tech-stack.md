---
starter_id: 10x-astro-starter
package_manager: npm
project_name: deck-delta
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: false
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
---

## Why this stack

DeckDelta is a solo, after-hours web app on a 3-week timeline with zero technology-forcing features — no auth, payments, realtime, AI, or background jobs. The 10x Astro Starter is the recommended default for (web-app, js): TypeScript-first, React 19 for interactive components, Tailwind CSS 4 for styling, and Cloudflare Pages for zero-config edge deploy. It passes all four agent-friendly quality gates and ships with conventions a stranger (or agent) can navigate immediately. The included Supabase integration goes unused for this project but adds no runtime cost. CI runs on GitHub Actions with auto-deploy on merge.
