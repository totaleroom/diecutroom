# DESIGN.md — DieCut.Room Visual Design Contract

This is the product-specific design contract for **DieCut.Room** (part of the **Totale.Room Engineering Suite**). Every AI app builder (Vercel/v0, Lovable, Cursor, ADE Antigravity, Codex, Claude Code) and contributor MUST follow this document before editing or adding UI.

Canonical references:
- Live Visual State Catalog (21 Desktop + 6 Mobile rendered screenshots): `docs/VISUAL-STATE-CATALOG.md` (`docs/visual-snapshots/`)
- CSS tokens: `src/index.css`
- Tactile primitives: `src/components/tactile/TactileUI.tsx`
- Behavioral & elevation rules: `.agents/skills/tactile-design/SKILL.md`
- Production brand logo: `public/assets/aistudio/Asset_2_5ca58983.svg` (Totale.Room white vector wordmark — the only production asset in that folder)

---

## 1. Aesthetic Direction — Precision Tactile Studio

- **Feel**: Quiet, engineered, physical drafting studio — light-mode first, crisp hairline precision (`0.5px`), raised white cards with fine rings and tight drops (never blurry glows, never glassmorphism, never generic SaaS rainbow gradients).
- **Hierarchy**: Driven by **ink contrast steps** (`ink-12`, `ink-11`, `ink-10`) and **surface elevation** (ground → panel → raised card → well), NOT loud colors or heavy bold walls.
- **Single Primary Action**: One solid black primary button (`--primary-bg: #17191F`, `--primary-fg: #FFFFFF`) per surface. Secondary buttons are white with `--shadow-button`. Destructive triggers stay white with `--red-11` text; only the final confirm inside a modal uses solid `--red-9`.

---

## 2. Exact Color Tokens (`src/index.css`)

### Neutral Scale (Cool Slate-Sand Hybrid)
| Token | Hex | Role |
| :--- | :--- | :--- |
| `--root-ink-1` / `--surface-top` | `#FCFCFD` / `#FFFFFF` | Raised cards, panels, overlays |
| `--root-ink-2` (`--ground`) | `#F4F5F7` | Main studio workspace canvas ground |
| `--root-ink-3` | `#ECEEF1` | Input wells, subtle section header tints |
| `--root-ink-4` | `#E3E6EB` | Focused input well / hover well |
| `--root-ink-6` (`--line`) | `#CDD2DB` | Hairline dividers (`0.5px`) & frame borders |
| `--root-ink-10` | `#5C626E` | Meta text, units, timestamps, helper hints |
| `--root-ink-11` | `#474D58` | Secondary labels & body descriptions |
| `--root-ink-12` (`--primary-bg`) | `#17191F` | Strong ink, values, titles, primary CTA fill |

### Semantic & Engineering Hues (Meaning Only — `-3` Tint Fill + `-11` Text)
| Scale | `-3` Tint | `-6` Edge | `-9` Solid | `-11` Text | Usage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Accent** | `#EEF2FF` | `#C7D2FE` | `#4F46E5` | `#3730A3` | Active engineering selection, CAD highlights, PDF dimension accents |
| **Green** | `#ECFDF5` | `#A7F3D0` | `#16A34A` | `#15803D` | BCT Safe (`AMAN`), locked cross-tie cartons, Pre-Flight pass |
| **Amber** | `#FFFBEB` | `#FDE68A` | `#D97706` | `#B45309` | Marginal BCT, column 1:1 warning, pending account |
| **Red** | `#FEF2F2` | `#FECACA` | `#DC2626` | `#B91C1C` | BCT unsafe, unsupported corner/fault line, destructive confirm |
| **Blue** | `#EFF6FF` | `#BFDBFE` | `#2563EB` | `#1D4ED8` | Informational hints, print/crease CAD notes |

---

## 3. Typography & Tabular Precision

- **Brand / Display**: `--font-brand` → `"Timeless Grotesk"` (optional drop-in via `public/fonts/` & `/api/fonts/available`), fallback `"Plus Jakarta Sans"`.
- **UI Body**: `--font-sans` → `"Plus Jakarta Sans"`, base `13px / 20px` (`--text-body`), meta `12px / 16px` (`--text-meta`), card/dialog title `16px / 24px`, section `20px / 28px`.
- **Engineering Values**: `--font-mono` → `"JetBrains Mono"` with `tabular-nums` for dimensions (`mm/cm/in`), FEFCO codes, ECT/BCT (`kgf`), safety factor, pallet weights, and ITF-14 barcodes.
- **Touch Floor**: On coarse pointers (`@media (pointer: coarse)`), input fields automatically step up to `16px` to prevent iOS zoom.

---

## 4. Surfaces, Radii, Controls & Motion

- **Radii Ladder**: `--radius-control: 6px`, `--radius-sm: 4px`, `--radius-container: 8px`, `--radius-feature: 12px`; utility pills & status badges use `9999px`.
- **Control Heights**: `34px` default, `30px` compact, `28px` utility pill, `24px` inline, `22px` icon button, `20px` badge, `38px` table row.
- **Fields**: Always sunken wells (`--ink-3` fill, no heavy outer border, `--focus-ring` 2px focus outline).
- **Press & Motion**: Subtle tactile press (`scale(0.97)`, `150ms`), strong ease-out (`cubic-bezier(0.23, 1, 0.32, 1)`), `150–300ms`. Never add decorative bounce or idle looping animations.
- **Reuse First**: Always import from `src/components/tactile/TactileUI.tsx` (`TactileButton`, `TactileCard`, `TactileInputWell`, `TactileSegmented`, `TactileBadge`, etc.) instead of inventing parallel styled wrappers.

---

## 5. Distinct Surface Exceptions (Do Not Overwrite)

1. **Halftone Offset-Sheet Auth Portal (`AuthGate.tsx`)**:
   - Sharp `2px` radius matte white sheet over `InteractiveMatrixCanvas` dark dot-matrix background, framed by `HalftonePerimeterFrame` and `TopRightSheetHalftone`.
   - Do **not** replace with rounded glass/gradient auth cards.
2. **4-Tier Responsive Workspace & Short-Landscape 3D HUD (`useWorkspaceLayout.ts`)**:
   - Tiers: `desktop >= 1280px`, `compact 1024–1279px` (auto-minimizes BCT rail), `tablet 768–1023px`, `mobile < 768px`.
   - Preserve `Focus Mode` (`F`/`Esc`), Mobile Floating Thumb Dock, top-right POV Camera Capsule (`Iso/Front/Top/Side`), compact `64px` sliders, and Short-Landscape bar (`height <= 500px`).
3. **2-Page A4 Palletizer Engineering PDF (`src/utils/palletizerReportPdf.ts`)**:
   - Mirrors **Precision Tactile Studio** tokens (`#17191F`, `#F4F5F7`, `#ECEEF1`, `#CDD2DB`, `#4F46E5`).
   - Header left: `"DIBUAT OLEH APLIKASI DIECUT.ROOM"`; Header far right: Totale.Room logo (`Asset_2_5ca58983.svg`).
   - 4 Normal Orthographic POVs use high-contrast orientation tinting (**Yellow `#FACC15`** for `0°/180°` vs **Sky-Cyan `#38BDF8`** for `90°/270°`) with crisp `#17191F` edges (interactive 3D viewport keeps Kraft/White toggle).

---

## 6. Anti-Drift Rules for External AI Builders

- Always inspect [`docs/VISUAL-STATE-CATALOG.md`](./docs/VISUAL-STATE-CATALOG.md) (`docs/visual-snapshots/`, 21 Desktop `1440×900` + 6 Mobile `390×844` authentic live renders) before modifying UI so every screen, modal, and responsive breakpoint stays 100% faithful to production.
- Never swap Tailwind v4 CSS tokens in `src/index.css` for default shadcn/Lovable/Base44 palettes.
- Never replace `TactileUI` primitives or `lucide-react` stroke style with mismatched component libraries.
- `public/assets/aistudio/` has been cleaned to contain **only** `Asset_2_5ca58983.svg` (the official Totale.Room production brand logo); never commit discussion screenshots or temporary reference PDFs there.
