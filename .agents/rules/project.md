---
trigger: always_on
description: Core orientation, truth order, visual design fidelity, and static runtime guardrails for DieCut.Room
---

# DieCut.Room — ADE Project Rules (`always_on`)

## 1. First-Scan & Truth Order
- Truth priority: **Code at HEAD** > `git diff <verified_at_commit>..HEAD` > `docs/STATUS.md` > `AGENTS.md` > `docs/01`–`08`.
- Before trusting prose docs, read `docs/STATUS.md` and run `node scripts/check-docs-drift.ts` (`npm run docs:check`, zero dependencies, runs in `< 1s`).
- Never fabricate test results: `automated_tests: NOT PRESENT` (no `test` script in `package.json`). Use `npm run lint`, `npm run build`, and `npm run docs:check -- --strict` to verify changes.

## 2. Visual Design Fidelity Anchor
- Follow `.agents/skills/tactile-design/SKILL.md` for every UI change.
- Preserve exact **Precision Tactile Studio** CSS tokens in `src/index.css` (`#17191F`, `#474D58`, `#5C626E`, `#CDD2DB`, `#ECEEF1`, `#F4F5F7`, `#4F46E5`) and primitives in `src/components/tactile/TactileUI.tsx`.
- Keep the sharp `2px` Halftone Offset-Sheet aesthetic on `AuthGate.tsx`, 4-tier responsive workspace (`useWorkspaceLayout.ts`), and `Palletizer` 2-page A4 PDF report branding consistent with the app.
- Production brand logo lives at `public/assets/aistudio/Asset_2_5ca58983.svg` (Totale.Room). Other reference screenshots/PDFs in `public/assets/aistudio/` are design references, not runtime UI assets.

## 3. Backend, Runtime & Build Guardrails
- Full-stack monolith: React 19 + Vite 6 + Tailwind v4 + Three.js + Web Worker + PWA (`vite-plugin-pwa`) served by Express (`server.ts`) on **Node.js 22+**.
- `server.ts` and `scripts/*.ts` execute directly via **Node 22+ native TypeScript type-stripping** (`node server.ts`, `node scripts/admin-reset.ts`, `node scripts/check-docs-drift.ts`). Keep backend/CLI TS syntax compatible with native type-stripping (no `enum`, no parameter properties, explicit `import type` where needed).
- Embedded SQLite (`node:sqlite`, WAL mode, 5 tables: `users`, `bct_history`, `saved_projects`, `system_meta`, `audit_logs`). Never add external DB dependencies.
- `Dockerfile` runner stage only installs `express` and `dotenv` — do not add third-party npm imports to `server.ts` or `scripts/*.ts` without updating `Dockerfile`.
- Never modify or commit `./data/*`, `.env`, or `.session_secret`. Keep `metadata.json` untouched (used by Google AI Studio runtime).

## 4. Post-Commit Documentation Hygiene
- Any change to `/api/*` routes, SQLite tables/columns, runtime env vars, `package.json` scripts, or major user capabilities MUST update `docs/STATUS.md` (and `docs/06-API-REFERENCE.md` / `docs/04-DEVELOPER-ARCHITECTURE.md` / `.env.example` as applicable) and pass `npm run docs:check -- --strict`.
