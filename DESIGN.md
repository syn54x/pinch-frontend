<!-- SEED: re-run /impeccable document once there's code to capture the actual tokens and components. -->

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
- Restrained chrome: a graphite ink accent (no hue) so every scrap of color in the interface belongs to data.
- A deliberate categorical palette that lives only in data — charts, category marks, trends.
- Light and dark themes from day one, with system-default as the third option.
- Numbers as first-class typography: mono/tabular figures for every amount.
- Motion as feedback, never choreography.

## 2. Colors

Restrained chrome around expressive data: near-neutral surfaces, a graphite accent, and a categorical palette reserved exclusively for financial data.

### Primary
- **Graphite** (light `oklch(0.27 0.012 250)` / `#22272c`; dark `oklch(0.92 0.006 250)` / `#e2e5e8`): the single accent. Primary actions, current selection, active state, focus. Locked after two rounds of comparison — warm coppers read as muddy brown in light mode, and even the cleanest chromatic option (emerald) put brand color on the same button that would soon sit beside green "positive" numbers. Graphite sidesteps both: near-black ink in light, near-white ink in dark, a whisper of cool tint (hue 250) shared with the neutral scale for cohesion, no hue to clash with anything. Both directions verified at AA (14+:1, far past the 4.5:1 floor).

### Neutral
- **Surface and ink ramps** (light background `oklch(0.985 0.002 250)`; dark background `oklch(0.145 0.004 250)`): near-zero-chroma neutrals, tinted a hair toward the graphite hue (250) for subconscious cohesion with the accent, defined in OKLCH with paired light and dark values from the start.

### Data Categorical Palette
- **Category colors** [to be resolved during implementation]: 8–12 distinguishable hues for spending categories, chart series, and trend lines. Designed as a set (consistent lightness/chroma bands in both themes), colorblind-checked.

### Named Rules
**The Chrome/Data Rule.** Interface chrome is graphite and near-zero-chroma neutrals, nothing else. All color belongs to data — a category, a series, a trend, a semantic state (success/warning/destructive). A colored decoration that encodes nothing is forbidden.

**The Cool Canvas Rule.** Neutrals carry only the faintest cool tint (chroma ≤ 0.006) shared with the graphite accent; the cream/sand/parchment body background is prohibited.

**The Three Themes Rule.** Light, dark, and system-default ship together from day one. No token exists without both light and dark values.

## 3. Typography

**UI Font:** Geist Variable (with system-ui fallback)
**Figures/Data Font:** Geist Mono, or Geist with tabular figures (with monospace fallback) — [to be finalized at implementation]

**Character:** A single precise technical sans carries the interface; monospaced or tabular figures give every dollar amount the alignment and authority of a ledger column. No display font, no serif — hierarchy comes from weight and size, not family changes.

### Hierarchy
- **Display / Headline / Title / Body / Label** [scale to be resolved during implementation]: fixed rem scale, tight ratio (1.125–1.2), per the product register. Body prose capped at 65–75ch; data tables may run dense.

### Named Rules
**The Tabular Rule.** Every monetary amount renders in tabular figures, right-aligned when in columns. A proportional-figure dollar amount is a bug.

## 4. Elevation

Flat by default. Depth is conveyed through tonal layering (surface steps between background, card, and popover) rather than shadows at rest; shadows appear only as a response to state — an open menu, a dragged element, a focused overlay. In dark mode, elevation is expressed by lightening the surface, not by darker shadows.

## 5. Components

[No component system exists yet beyond stock shadcn/ui primitives. Documented on the next scan-mode run, once the visual identity is implemented.]

## 6. Do's and Don'ts

### Do:
- **Do** keep chrome restrained: neutrals plus graphite, with categorical color only in data (The Chrome/Data Rule).
- **Do** ship every color token with both light and dark values, and honor the system theme preference.
- **Do** set all amounts in tabular figures, right-aligned in columns (The Tabular Rule).
- **Do** use motion as feedback — 150–250ms state transitions that make the review flow feel instant — with a `prefers-reduced-motion` alternative for every animation.
- **Do** hold the Copilot.money / Raycast / Linear bar: earned familiarity, keyboard-first speed, premium polish.

### Don't:
- **Don't** look like YNAB, Lunch Money, or Mint — no budgeting-app cheerfulness, no cluttered ad-tier layouts.
- **Don't** fall into generic SaaS dashboard grammar — hero metric cards everywhere, identical card grids.
- **Don't** go spreadsheet-austere; premium is restraint, not absence.
- **Don't** warm the neutrals — no cream, sand, or parchment backgrounds (The Cool Canvas Rule).
- **Don't** use categorical or accent color as decoration on inactive states.
- **Don't** choreograph — no orchestrated page-load sequences; product loads into a task.
