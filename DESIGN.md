<!-- Tokens extracted from docs/wireframes (Claude Design export) on 2026-07-21;
     type system + purple light theme re-extracted from the F10 canvas
     (docs/pinch-app-wireframes) on 2026-08-06.
     Re-run /impeccable document once real components exist to fill §5. -->

---
name: Pinch
description: Serious money intelligence, zero busywork.
---

# Design System: Pinch

## 1. Overview

**Creative North Star: "The Quiet Ledger"**

A private ledger kept by something smarter than you have time to be. Pinch's surfaces read like finished work — precise columns, settled numbers, chrome so disciplined it disappears, and color spent only where the money is. The system's character comes from the Copilot.money / Raycast / Linear lineage: modern product chrome, power-user density where the data earns it, and an interface that responds instantly because the user is mid-task, not browsing.

This system explicitly rejects the budgeting-app register — no cheerfulness, no coaching, no clutter. It must never feel like YNAB, Lunch Money, or Mint. It is confident, precise, effortless: the tool states what it found and gets out of the way.

**Key Characteristics:**
- Restrained light chrome: violet-tinted paper and panels around the brand's purple accent — quiet surfaces, one committed accent, every other scrap of color belonging to data (F10 superseded the earlier graphite light chrome).
- A committed dark theme: purple-navy canvas where the accent *is* Penny's purple — in the dark, the app wears the assistant's color at full saturation.
- A deliberate muted categorical palette that lives only in data — charts, category marks, trends.
- Light and dark themes from day one, with system-default as the third option.
- Numbers as first-class typography: mono/tabular figures for every amount.
- Motion as feedback, never choreography.

**Source of truth:** the settled wireframes at `docs/pinch-app-wireframes/project/App Wireframes.dc.html` — screens in user-journey order, each in light and dark. Tokens in `src/index.css` are extracted from them (AA-normalized where the raw values fell short).

## 2. Colors

Two registers of one purple discipline (F10 amended the earlier graphite-light scheme). Light: violet-tinted paper around the brand's purple accent. Dark: a committed Penny-purple theme — purple-tinted surfaces, purple alpha borders, and the accent unified with Penny's color. Both keep every other scrap of color reserved for data.

### Primary / Accent
- **Light — Brand purple** (`oklch(0.505 0.209 291)` / `#6b3fd0`): primary actions, current selection, active state, focus, progress fills. The wireframes' light accent — the brand carried into light chrome. AA-verified (6.5:1 as text on white and under white text).
- **Dark — Penny purple** (`oklch(0.67 0.175 295)` / `#a179f2`, with near-black-purple ink `oklch(0.19 0.034 295)`): in dark mode the accent and Penny's identity color are one token value. The dark theme is the brand's full color moment, expressed as canvas + accent, with glow permitted on the primary button and Penny surfaces (see Elevation). AA-verified (5.8:1 on the accent, 5.1:1 as text on card).

### Penny
- **`--penny`** (light `oklch(0.555 0.156 295)` / `#7a5cc4`; dark = the accent): the assistant's identity color — her avatar dot, her pill in the sidebar/top bar, her chat affordances. A lighter, softer purple than the light accent; in dark mode the whole accent system adopts it.

### Neutral
- **Light surfaces** (background `oklch(0.987 0.007 295)` / `#fbfaff`, card white, sidebar `oklch(0.965 0.012 296)` / `#f4f2fb`, muted `#ece8f8`, selected `#e6dffa`): violet-tinted cool neutrals, hue ~295 shared with the accent. Borders are violet alpha (`oklch(0.414 0.113 294 / 14%)`) so they composite naturally on any surface.
- **Dark surfaces** (background `oklch(0.19 0.047 290)`, sidebar `0.215`, card `0.25`, popover `0.28`): purple-tinted (chroma ~0.05, hue 290) with tonal-lightening depth. Borders are purple alpha (`oklch(0.72 0.108 295 / 15%)`).

### Semantic
- **Positive** `--success` (light `oklch(0.54 0.084 158)`; dark `oklch(0.73 0.106 158)`) and **negative** `--destructive` (light `oklch(0.56 0.126 31)` — a red-clay, deliberately softer than alarm-red; dark `oklch(0.71 0.117 32)`). Warning per `--warning` (amber, used for "due" badges at ~15% tint bg).

### Provenance Palette
- **`--prov-rule` / `--prov-hist` / `--prov-ai` / `--prov-det`** (blue / green / purple / amber): how a categorization happened — by user rule, by history match, by AI, or deterministically. Rendered as small mono-caps badges: colored text on a tint of itself (`/13` light, `/20` dark), with a leading dot. This is data color, not chrome: it encodes trust lineage in the review flow. All values AA-normalized (≥4.5:1 as raw text on card).

### Data Categorical Palette
- **`--cat-1..10`**: ten muted hues (31, 80, 115, 154, 195, 228, 261, 292, 322, 350) at consistent bands — light `L 0.55 / C 0.10`, dark `L 0.73 / C 0.11` — derived from the wireframes' muted register (green/gold/purple/blue/clay/teal) and AA-normalized for raw text use. Users pick a color + emoji per category; the emoji is the second channel, so hue alone never has to carry identification (colorblind resilience). `--chart-1..5` alias the first five.
- **`--progress`**: bar fills (onboarding steps, debt pace, budgets) — dark ink in light mode, muted lavender in dark.

### Named Rules
**The Chrome/Data Rule (amended).** Interface chrome is the accent plus its neutral scale, nothing else — brand purple + violet-tinted neutrals in light, Penny purple + purple-tinted neutrals in dark. All other color belongs to data: a category, a series, a trend, a semantic state, a provenance badge. A colored decoration that encodes nothing is forbidden.

**The Two Registers Rule (amended by F10).** Light and dark are not tints of each other, but they now share the brand's hue. Light is the working ledger — violet-whisper paper, one saturated purple accent, everything else quiet. Dark is the brand's full color moment — Penny's purple as canvas and accent, with the glow privileges Elevation grants. Don't flatten the asymmetry: light surfaces stay near-white (chroma ≤ 0.04), dark never falls back to graphite.

**The Cool Canvas Rule.** No cream/sand/parchment, ever. Light neutrals carry only a faint cool violet tint (chroma ≤ 0.04, hue ~295); dark surfaces are cool purple, never warm.

**The Three Themes Rule.** Light, dark, and system-default ship together from day one. No token exists without both light and dark values.

## 3. Typography

**Heading Font:** Space Grotesk Variable (`--font-heading`) — headings, the brand name, hero amounts. Tracking −0.02em.
**UI Font:** Instrument Sans Variable (`--font-sans`, with system-ui fallback) — the body voice.
**Figures/Data Font:** JetBrains Mono Variable (`--font-mono`, with monospace fallback) — the mono carries amounts *and* the label voice.

**Character:** Three faces, three roles (the F10 wireframes' type system, superseding the single-Geist stack): a characterful grotesk for the few words that lead a surface, a quiet sans for everything read, and monospaced tabular figures giving every dollar amount the alignment and authority of a ledger column. Hierarchy comes from role, weight, and size.

### Hierarchy (from the wireframes)
- **Hero amount** — 24–30px / 600 / heading face, tabular, tracking −0.02em (`amount-big` utility + size). The one big number a surface leads with. Smaller amounts stay mono (`amount`).
- **H1** — 20px / 600 / heading face. Page titles.
- **H2** — 14–15px / 600 / heading face. Card and section titles (carried by a base rule on h1–h3; `label-caps` overrides where a dense card header speaks the label voice instead).
- **Body** — 12.5–13px / 400–500 sans. Dense product body; prose capped at 65–75ch, tables may run dense.
- **Sub** — 11.5px / 400, muted. Secondary lines under rows and titles.
- **Label** — 10px / 600 / mono, uppercase, tracking 0.08em, muted (`label-caps` utility). Sidebar sections, column headers, field labels. This mono-caps whisper is the system's most distinctive voice element — use it for *structure*, never for headings or emphasis.

### Named Rules
**The Tabular Rule.** Every monetary amount renders in tabular figures, right-aligned when in columns. A proportional-figure dollar amount is a bug.

**The Label Voice Rule.** Structural labels are small mono caps (`label-caps`); headings are the sans. Never mix the two roles. Which voice a given card header speaks is settled by its wireframe (§5 ground truth): page-level section titles ("By account", "This cycle") are H2 sans, while dense detail cards (the loan detail's "Loan terms" / "Recent payments") set their headers as labels — there the label *is* the structure.

## 4. Elevation

Flat by default. Depth is conveyed through tonal layering (surface steps between background, card, and popover) rather than shadows at rest; shadows appear only as a response to state — an open menu, a dragged element, a focused overlay. In dark mode, elevation is expressed by lightening the surface, not by darker shadows.

**Dark-mode glow (scoped).** The wireframes grant exactly two glow treatments in dark mode: the primary button (`0 0 0 1px` accent at 50% + a soft accent drop glow) and Penny's surfaces (accent-tinted border + glow). Cards may carry a 1px inset top highlight (`rgba(185,158,255,.07)`). Nothing else glows — glow is the accent's privilege, not a decoration.

**Radius hierarchy.** Containers are rounder than controls: cards 12px (`rounded-lg`, `--radius: 0.75rem`), buttons/inputs ~10px (`rounded-md`), pills/badges smaller still. Don't flatten the hierarchy by putting `rounded-lg` on controls.

## 5. Components

Implemented code is still mostly stock shadcn/ui primitives, but the wireframes specify the full component vocabulary. When building a screen, its wireframe (by number, below) is the ground truth for layout and composition; this list is the shared vocabulary across screens.

**App shell** (wireframe #24 is the reference):
- **Sidebar** — 212px fixed, panel surface, 1px border-right. Brand row (24px rounded-square logo in the accent color + name), nav items (13px, muted → ink+selected-bg when active), mono-caps section labels, a spacer, then the **Penny pill** (card-surface bordered row: purple dot + two-line label; accent-tinted border + glow in dark) and the user row.
- **Top bar** — 52px, border-bottom. Screen title, inline search, spacer, **Ask Penny** affordance with `⌘K` kbd hint. Penny is reachable from every screen.
- **Inbox count** — mono badge in the nav item, accent bg: the live number of transactions awaiting review.

**Data & ledger vocabulary:**
- **Amount** — `amount` utility; `.big` 30px hero variant; positive/negative color only when direction is the point.
- **Category pill** — emoji + name on a 15% tint of the category color (dark: 28% tint, text mixed toward white). Color+emoji pairs are user-chosen and carry through charts, rows, and the register.
- **Provenance badge** — mono-caps chip (dot + RULE/HIST/AI/DET/—) on a self-tint; the trust lineage of a categorization.
- **Paid / Due badges** — mono-caps, muted-on-fill for paid, warning-tinted for due.
- **Chip** — bordered pill filter; selected = accent bg + accent-ink.
- **Spark / progress** — minimal bar charts in `--fill`; progress fills in `--progress`; solid line = history, dashed = Penny's projection.

**Conventions:** buttons come in primary (accent), default (bordered card), ghost, and small (27–28px) variants; skeletons are `--muted` rounded blocks; avatars are `--muted` circles; dividers are 1px `--border`.

**Screen index** (docs/wireframes, in journey order): 1 Sign up · 2 Log in · 3 Reset password · 4 Verify email · 5 Onboarding · 6 Dashboard · 7 Inbox/review · 8 Register · 9 Import CSV · 10 Manual entry · 11 Net Worth · 12 Recurring · 13 Accounts · 14 Debt · 15 Loan detail · 16 Connections · 17 Categories & Rules · 18 New category · 19 New rule · 20 Tags · 21 What Penny learned · 22 Penny chat · 23 Settings · 24 App shell.

## 6. Do's and Don'ts

### Do:
- **Do** keep chrome restrained: the accent plus its neutral scale, with categorical/provenance color only in data (The Chrome/Data Rule).
- **Do** honor the light/dark asymmetry — violet-whisper light, full Penny-purple dark (The Two Registers Rule).
- **Do** ship every color token with both light and dark values, and honor the system theme preference.
- **Do** set all amounts in tabular figures, right-aligned in columns (The Tabular Rule).
- **Do** use the `label-caps` mono voice for structure and the sans for headings (The Label Voice Rule).
- **Do** use motion as feedback — 150–250ms state transitions that make the review flow feel instant — with a `prefers-reduced-motion` alternative for every animation.
- **Do** hold the Copilot.money / Raycast / Linear bar: earned familiarity, keyboard-first speed, premium polish.

### Don't:
- **Don't** look like YNAB, Lunch Money, or Mint — no budgeting-app cheerfulness, no cluttered ad-tier layouts.
- **Don't** fall into generic SaaS dashboard grammar — hero metric cards everywhere, identical card grids.
- **Don't** go spreadsheet-austere; premium is restraint, not absence.
- **Don't** warm the neutrals — no cream, sand, or parchment backgrounds (The Cool Canvas Rule).
- **Don't** saturate light-mode surfaces — the accent is light mode's only strong purple; canvas and panels stay a violet whisper.
- **Don't** glow anything in dark mode beyond the primary button and Penny surfaces.
- **Don't** use categorical or accent color as decoration on inactive states.
- **Don't** choreograph — no orchestrated page-load sequences; product loads into a task.
