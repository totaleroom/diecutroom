---
trigger: always_on
description: Core orientation, truth order, visual design fidelity, and static runtime guardrails for DieCut.Room
---

# DieCut.Room — ADE Project Rules (`always_on`)

## 1. First-Scan, Indexing & Truth Order
- Truth priority: **Code at HEAD** > `git diff <verified_at_commit>..HEAD` > `docs/STATUS.md` > `docs/CODEBASE_INDEX.md` > `DESIGN.md` > `AGENTS.md`.
- Before reading large files (`server.ts`, `PalletizerWorkspace.tsx`, `Box3DViewer.tsx`), read `docs/STATUS.md` and `docs/CODEBASE_INDEX.md` to jump directly to exact line anchors and save tokens/credits.
- Run `node scripts/check-docs-drift.ts` (`npm run docs:check`, zero dependencies, `< 1s`) to check drift.
- Never fabricate test results: `automated_tests: NOT PRESENT`. Verify with `npm run lint`, `npm run build`, `npm run index:build`, and `npm run docs:check -- --strict`.

## 2. Visual Design Fidelity Anchor
- Follow root `DESIGN.md`, `docs/VISUAL-STATE-CATALOG.md` (27 live Desktop + Mobile screenshots in `docs/visual-snapshots/`), and `.agents/skills/tactile-design/SKILL.md` for every UI change. Vision-capable agents MUST inspect `docs/VISUAL-STATE-CATALOG.md` before modifying UI and MUST NOT invent custom layouts or alternative palettes.
- Preserve exact **Precision Tactile Studio** CSS tokens in `src/index.css` (`#17191F`, `#474D58`, `#5C626E`, `#CDD2DB`, `#ECEEF1`, `#F4F5F7`, `#4F46E5`) and primitives in `src/components/tactile/TactileUI.tsx`.
- Keep the sharp `2px` Halftone Offset-Sheet aesthetic on `AuthGate.tsx`, 4-tier responsive workspace (`useWorkspaceLayout.ts`), and `Palletizer` 2-page A4 PDF report branding consistent with the app.
- Production brand logo lives at `public/assets/aistudio/Asset_2_5ca58983.svg` (Totale.Room — the sole production asset in that folder). Run `npm run snapshots:capture` when UI states change materially.

## 3. Backend, Split-Deploy & Build Guardrails
- Full-stack monolith: React 19 + Vite 6 + Tailwind v4 + Three.js + Web Worker + PWA (`vite-plugin-pwa`) served by Express (`server.ts`) on **Node.js 22+**. Do **NOT** rewrite the backend to Supabase, Base44 SDK, or serverless SQLite.
- Supports both same-origin VPS monolith (default) and optional Split-Deploy (Vercel frontend via `vercel.json` + `VITE_API_BASE_URL` pointing to VPS backend with `CORS_ALLOWED_ORIGINS`).
- `server.ts` and `scripts/*.ts` execute directly via **Node 22+ native TypeScript type-stripping**. Keep backend/CLI TS syntax compatible with native type-stripping.
- Embedded SQLite (`node:sqlite`, WAL mode, 5 tables: `users`, `bct_history`, `saved_projects`, `system_meta`, `audit_logs`). Never add external DB dependencies.
- `Dockerfile` runner stage only installs `express` and `dotenv`. Never modify or commit `./data/*`, `.env`, or `.session_secret`. Keep `metadata.json` untouched (used by Google AI Studio runtime).

## 4. Post-Commit Documentation Hygiene
- Any change to modules, `/api/*` routes, SQLite schema, runtime env vars, scripts, or core features MUST run `npm run index:build`, update `docs/STATUS.md`, and pass `npm run docs:check -- --strict`.
