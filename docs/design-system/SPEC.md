# Dobeu Design System

Design system for **Dobeu Tech Solutions** — a software review and technology services ecosystem spanning **17 sub-brand domains** (dobeu.dev, dobeu.net, dobeu.online, dobeu.io, etc.). The system is designed so a single mark, palette and type family can flex across five product surfaces:

1. **Consumer review sites** (dobeu.net) — "Simplify your software decisions"
2. **Developer tools & portals** (dobeu.dev) — "Your AI pair programmer"
3. **SaaS dashboards / analytics platforms**
4. **Marketplace services**
5. **Freight & logistics mobile tools**

All 17 sub-brands share the **same mark, colors, and typography** — they differentiate only by **TLD accent color** and **tagline**. Dark mode is the default for developer products; light mode for consumer products.

## Brand personality

Approachable, trustworthy, simple — **"a knowledgeable friend, not a corporate entity."** The visual DNA is warm indigo + amber, soft rounded corners, no gradients, no drop-shadows on hero elements, and one signature motif: **The Overlap** — two indigo circles with a solid amber circle at their intersection.

---

## Sources

- **Figma file** — attached as `canvas.fig` (virtual filesystem). 5 pages, 64 top-level frames: Cover, Dobeu-Design-System (Primitives, Typography, Semantic tokens, Radius, Logo lockups), Brand-Logos, Components (39 components), Documentation.
- **Brand kit folder** — `C:\Users\jswil\dobeu-eco\Dobeu Eco Brand Kit` (referenced in Figma; PNG exports live in `uploads/` and `assets/`).
- **Uploads** (21 PNG/JPG) — logo lockups, marks, OG cards, social banners, color palette specimen, typography specimen, dark-mode comparison.

No codebase was attached. UI kits in this system are recreated from Figma component pseudocode and brand PNGs.

---

## Content Fundamentals

**Voice:** second-person, direct, confident, but never salesy. Sentences are short. Words are plain.

**Casing:** Sentence case for UI labels, headings, and buttons. `dobeu` wordmark is always lowercase. TLD is lowercase (`dobeu.dev`, not `Dobeu.dev`). Uppercase is reserved for tiny meta labels (RATINGS · BADGES · TAGS).

**Person:** We say **"you"** and **"we"** — never "our users", "the customer", or third-person marketing-speak. Examples from the Figma copy:

- `"Your AI pair programmer"` — you, not "developers"
- `"Simplify your software decisions"` — you, not "buyers"
- `"We help people make confident software decisions."` — we, plainly

**Punctuation:** No exclamation marks in product UI. Ellipses only for loading. Em-dashes are fine in marketing.

**Emoji:** **Not used** in the product interface or marketing copy. The one "visual emoji" is the mark itself. (If you find yourself reaching for 🚀 or 💡, write a better sentence instead.)

**Numbers:** Ratings render as numeric `4.8` plus star icons, never `★★★★½`. Prices use currency symbols, not words. Dates are `Apr 24, 2026` for consumer-facing and ISO `2026-04-24` for developer docs.

**Vibe:** The knowledgeable friend who used the software and will tell you honestly whether it's any good. Never hypes. Never hedges. Calls out tradeoffs.

**Do / Don't — real examples:**

| Do                                             | Don't                                             |
| ---------------------------------------------- | ------------------------------------------------- |
| Simplify your software decisions               | Revolutionize your SaaS procurement journey       |
| Your AI pair programmer                        | Unlock next-gen AI-powered developer productivity |
| Honest software reviews                        | Crowdsourced ecosystem intelligence               |
| We read the release notes so you don't have to | Stay ahead of the curve with our platform         |

---

## Visual Foundations

### Colors

Six brand primitives + three semantic + two neutrals. Everything else is a semantic alias.

- **Primary Indigo `#6B5CE7`** — default links, light-mode CTA, mark's left circle
- **Deep Indigo `#4A3FA8`** — headings in light mode, mark's right circle
- **Warm Amber `#F4A261`** — mark's center, rating stars, dark-mode CTA, accent
- **Soft Cream `#FFF8F0`** — light-mode secondary surface (cards)
- **Dark Surface `#1A1A2E`** — dark-mode default page bg
- **Dark Elevated `#242440`** — dark-mode card surface
- **Text Gray `#2D2D3A`** — body copy light mode
- **Tints** `#E8E5FA` (indigo-10), `#FEF0E0` (amber-10) — subtle zone fills
- **Semantic** success `#4CAF50`, warning `#F4A261`, error `#E07A5F`

**CTA swap:** indigo in light mode, amber in dark mode. This is the whole contrast trick — the CTA always reads against its surface.

### Typography

- **Primary:** **Nunito** (400/500/600/700/800) — a warm rounded humanist. Picks up the "friendly, not corporate" personality. Load from Google Fonts.
- **Fallback:** Quicksand.
- **Mono:** **JetBrains Mono** (code, token values, dev.portal UI).
- **Note:** The Figma reconstructions use **Inter** in many frames — this appears to be a fallback rendering. The brand spec (and the typography specimen PNG) both specify Nunito. **We follow Nunito as the source of truth.**

Scale: Display 48 / H1 36 / H2 28 / H3 22 / H4 18 / Body 16 / Small 14 / Label 12 (uppercase).

### Spacing & layout

4pt grid: 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64 / 80. Standard page gutter is 80px on 1440+. Cards use 20px internal padding.

### Radii

Three sizes: **6 / 12 / 20**. Small (6) = tags, badges, tight controls. Medium (12) = buttons, inputs, avatars. Large (20) = cards, modals, hero elements. Pills (999) for rating chips and status pills.

### Backgrounds

- **Flat fills, no gradients.** Surfaces are solid color.
- **No photography in marketing** — the hero is always the mark on a flat dark or cream surface.
- **Social banners use a 4px amber accent bar** along the bottom edge (see `assets/og-card-dobeu-*.png`).
- No patterns, no textures, no noise.

### Animation

- Transitions are **150–200ms, `ease-out`**. No bouncing, no spring-heavy motion.
- Fades + small 4–8px translates only. No scale pops.
- Rating stars fill instantly on hover — no cascading wipe.
- Page transitions are opacity-only.

### Hover / press

- **Hover:** background darkens ~6% (use `filter: brightness(0.94)` on indigo; `brightness(1.05)` on dark surfaces). No border color change on hover.
- **Press:** transform: `translateY(1px)` + brightness darker. No scale.
- **Focus:** 3px indigo ring `rgba(107,92,231,0.22)` offset 2px. Always visible — never remove outlines.

### Borders

- **1px solid** in all cases.
- Light mode: `#E0DFF5` (tint of indigo-primary).
- Dark mode: `#2A2A45` (barely-visible elevator).
- **No colored borders** on cards except active/selected states (indigo).

### Shadows

- Four-step scale. **All shadows are soft, warm, and tinted toward `rgba(26,26,46,*)`** — never pure black. Never more than 18% alpha.
- Cards use `shadow-sm` at rest, `shadow-md` on hover.
- **No inner shadows** anywhere in the system.
- **No protection gradients** — the amber bar + flat dark surface do the separation work.

### Transparency & blur

- Backdrop blur only on modals and toasts (backdrop-filter: blur(12px) + 60% alpha overlay).
- Don't use transparency on cards, buttons, or navbars.

### Imagery

- Warm, slightly desaturated if photography is used at all.
- Preferred: **no imagery** — let the mark and type do the work.
- Illustrations, when needed, use the brand palette only (indigo + amber + cream). No rainbow, no gradients, no 3D renders.

### Card anatomy

- Background: `bg-secondary` (cream in light, elevated in dark)
- Border: 1px `border-default`, OR `shadow-sm` — **not both**
- Radius: 20px (large) or 12px (compact list rows)
- Padding: 20px
- Title: H4 in `fg-heading`, supporting body in `fg-body`

### Layout rules (fixed)

- Navbars are 64px tall, never taller.
- The wordmark is always 22–28px, always in `fg-heading`.
- Buttons never stretch full-width except in mobile forms and modals.
- Amber is never used on large surfaces — only as an accent dot, bar, or dark-mode CTA.

---

## Iconography

The Figma file uses a single local component called **`Icon / Dot`** as a universal placeholder — it is not a real icon system.

**Decision:** Dobeu does **not ship a custom icon font**. The system uses **[Lucide](https://lucide.dev)** via CDN — stroke-based, 1.5px, rounded line caps, matching Nunito's warm-geometric personality.

```html
<script src="https://unpkg.com/lucide@latest"></script>
<script>
  lucide.createIcons();
</script>
<i
  data-lucide="star"
  style="width:16px;height:16px;color:var(--accent-rating)"
></i>
```

**Rules:**

- **Stroke weight 1.5px**, rounded caps/joins (Lucide's default).
- **Size scale:** 14, 16, 18, 20, 24. Buttons use 16; navbars use 20.
- **Color:** always inherits from `currentColor` — never hardcode.
- **Do not mix** Lucide with Material Icons, Heroicons, or emoji in the same surface.
- **SVG logos & the mark** live in `assets/` as PNG (the Figma brand kit ships PNG). Use as `<img>` — do not redraw.
- **Emoji:** not used.
- **Unicode glyphs as icons:** not used (the one exception is `×` for close, which is intentional for accessibility).

**Flagged substitution:** The real brand may have a proprietary icon set — we didn't find one. Lucide is our best match for the warm-geometric personality; swap if you ship something else.

---

## Index (what's in this folder)

```
Dobeu-Design-System/
├── README.md                ← you are here
├── SKILL.md                 ← Agent Skill entrypoint
├── colors_and_type.css      ← all tokens (primitive + semantic + type scale)
├── assets/                  ← PNG brand kit (logos, marks, OG cards, banners)
├── preview/                 ← HTML cards that populate the Design System tab
│   ├── logo-*.html
│   ├── colors-*.html
│   ├── type-*.html
│   ├── radius-*.html
│   ├── button-*.html
│   └── ...
└── ui_kits/
    ├── dobeu-net/           ← Consumer review site (light mode)
    │   ├── README.md
    │   ├── index.html
    │   └── *.jsx components
    └── dobeu-dev/           ← Developer portal (dark mode)
        ├── README.md
        ├── index.html
        └── *.jsx components
```

**Every registered preview card is visible in the Design System tab** of this project. The two `ui_kits/*/index.html` files are full-bleed interactive recreations — open them to click through login, browse reviews, send a chat message, etc.
