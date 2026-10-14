# Doanbogo Design System

> **Purpose**
>
> This file is the single source of truth for visual tone, color usage, and UI styling in the Doanbogo project.
>
> When generating or modifying code, **always read this file first** and preserve the visual system defined here.
> Do not invent new brand colors, replace existing colors with arbitrary hex values, or change the visual tone without an explicit design-system decision.

---

# 1. Product Tone

Doanbogo is a **knitting work tool**, not a generic productivity dashboard or decorative craft app.

The UI should feel:

- Calm
- Functional
- Warm
- Focused
- Craft-oriented
- Modern, but not overly digital
- Cozy, but not cute or childish
- Dense enough for real work
- Visually quiet around the pattern/document

The document, knitting chart, and current work state should remain the visual focus.

Avoid:

- Excessively bright colors
- Strong gradients
- Neon accents
- Decorative shadows
- Overly rounded / bubbly UI
- Too many colored cards
- Excessive beige-on-beige styling
- SaaS-dashboard aesthetics
- Cute pastel craft-app aesthetics

---

# 2. Core Color System

These colors are fixed brand colors.

Do not replace them without updating this file first.

| Role | Name | Hex | Primary Use |
|---|---|---|---|
| Primary | Moss Olive | `#47613F` | Primary actions, selected states, active controls |
| Secondary | Muted Steel Blue | `#4F6B7A` | Secondary actions, information controls, page/navigation utility |
| Tertiary | Deep Teal Green | `#3D705C` | Progress, completion, positive state, supporting functional accents |
| Neutral | Warm Off White | `#F7F4EE` | Main app background |
| Surface | Soft White | `#FFFCF7` | Cards, popovers, and controls |
| Viewer Background | Neutral Canvas Surround | `#E9E6DF` | Area around the original document |
| Selected | Soft Olive | `#E6EDE0` | Selected and active controls |
| Text | Craft Charcoal | `#2E332D` | Primary text |
| Secondary Text | Muted Olive Gray | `#666B60` | Supporting text |
| Border | Warm Border | `#E5DDD2` | Borders and separators |

---

# 3. Semantic Color Roles

Use semantic roles in code instead of arbitrary hex values.

Recommended token structure:

```css
:root {
  --color-primary: #47613F;
  --color-primary-soft: #E6EDE0;
  --color-secondary: #4F6B7A;
  --color-tertiary: #3D705C;

  --color-background: #F7F4EE;
  --color-surface: #FFFCF7;
  --color-surface-subtle: #F4F1EC;
  --color-viewer-background: #E9E6DF;

  --color-text: #2E332D;
  --color-text-secondary: #666B60;
  --color-text-muted: #918B84;

  --color-border: #E5DDD2;
  --color-divider: #ECE6DF;

  --color-primary-hover: #3D5537;
  --color-primary-pressed: #35492F;
  --color-secondary-hover: #435D69;
  --color-secondary-soft: #E9EEF1;

  --color-tertiary-soft: #E5F0EB;

  --color-danger: #B9473F;
  --color-danger-soft: #F7E9E6;

  --color-warning: #B88732;
  --color-warning-soft: #F6EEDC;

  --color-focus-ring: rgba(71, 97, 63, .3);
}
```

Do not use raw hex values directly inside components when a semantic token exists.

Bad:

```css
button {
  background: var(--color-primary);
}
```

Preferred:

```css
button {
  background: var(--color-primary);
}
```

---

# 4. Color Usage Rules

## Primary — `#47613F`

Use for:

- Primary CTA
- Selected navigation
- Active tool
- Active toggle
- Current selected item
- Main confirmation action
- Strong interactive emphasis

Examples:

- `계속 뜨기`
- `적용`
- `저장`
- Selected Viewer tool
- Active tab
- Current project indicator

Do not use Primary as:

- Large page background
- Decorative full-width block
- Every icon color
- Large illustration background
- Secondary information state

Primary must remain visually meaningful.

---

## Secondary — `#4F6B7A`

Use for:

- Secondary action
- Utility controls
- Page management
- Navigation support
- Informational actions
- Dual view / page tools
- Low-emphasis functional controls

Examples:

- Secondary button
- Page navigation control
- Dual-view control
- Utility icon
- Informational state

Secondary should make the product feel more like a serious tool without becoming cold or corporate.

---

## Tertiary — `#3D705C`

Use for:

- Progress
- Completed state
- Positive state
- Saved state
- Non-critical success indicator
- Work completion cues

Examples:

- `저장됨`
- Completed project status
- Progress completion
- Positive status dot

Do not use Tertiary interchangeably with Primary.

Primary = interaction / selection<br>
Tertiary = progress / positive state

---

# 5. Viewer-Specific Color Rules

The Viewer is the most important screen.

The pattern/document must remain visually dominant.

Therefore:

- Use white or near-white behind the actual pattern/document.
- Do not tint the PDF/document background with brand colors.
- Keep toolbars and work bars low-contrast.
- Brand color should appear only where interaction or status requires it.
- Avoid multiple colored controls visible at once.

Recommended Viewer structure:

```text
Document / Pattern
→ White or near-white

Viewer background
→ Neutral gray / warm neutral

Primary action
→ Primary

Utility action
→ Secondary

Progress / completed status
→ Tertiary
```

---

# 6. Progress Line Color

Progress and reference lines use the same approved ten-color preset as annotation tools. New progress lines default to pink `#EC4899`; this is a tool color, not the global app accent. Preserve explicitly saved colors on existing guides and settings.

---

# 7. Annotation Colors

Annotation colors are functional tools and use this approved ten-color preset. Apply it to pen, straight line, highlighter, text, region highlight, progress line, and reference line controls.

```text
Pink          #EC4899
Red           #EF4444
Orange        #F97316
Yellow        #FACC15
Green         #22C55E
Teal          #14B8A6
Sky Blue      #38BDF8
Blue          #3B82F6
Purple        #A855F7
Dark Gray     #374151
```

Show colors in two rows of five in this order. Do not add custom colors or an extra current-color swatch. Existing saved annotation and line colors remain unchanged until the user chooses a preset.

Use dark gray as the new pen, straight-line, and text default; yellow for highlighter and region-highlight; and pink for progress lines. Counter, brand, and yarn colors remain unchanged.

---

# 8. Surface Hierarchy

Use surface contrast instead of excessive borders and shadows.

Recommended hierarchy:

```text
App background
#F7F4EE

Main surface
#FFFCF7

Subtle grouped surface
#F4F1EC

Viewer surround
#E9E6DF

Selected background
#E6EDE0

Border
#E5DDD2

Divider
#ECE6DF
```

Avoid:

- Dark tinted cards
- Multiple beige shades with unclear hierarchy
- Heavy shadows around every card
- Floating card overload

---

# 9. Text Hierarchy

```text
Primary text
#2E332D

Secondary text
#666B60

Muted / metadata
#918B84
```

Rules:

- Headings should use Primary text.
- Supporting text should use Secondary.
- Metadata and low-priority labels use Muted.
- Never use brand colors for normal body text.
- Avoid pure black `#000000` unless rendering requires it.

---

# 10. Button System

## Primary Button

```text
Background: #47613F
Text: White
```

Use for one main action per area.

Examples:

- 저장
- 적용
- 만들기
- 이어서 뜨기

---

## Secondary Button

Preferred:

```text
Background: transparent or subtle surface
Border: #D9D3CB
Text: #4F6B7A
```

or soft variant:

```text
Background: #E9EEF1
Text: #4F6B7A
```

---

## Destructive Button

```text
Text / icon: #B9473F
Soft background: #F7E9E6
```

Do not use Primary or Tertiary for delete actions.

---

# 11. Selection State

Selection should be clear but restrained.

Preferred:

```text
Border: Primary
Soft background: Primary soft
Icon/text: Primary
```

Example:

```css
.is-selected {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
  color: var(--color-primary);
}
```

Avoid:

- Fully filling every selected card with Primary
- Strong glow
- Bright outline
- Multiple simultaneous accent colors

---

# 12. Status Colors

Use semantic meaning consistently.

```text
Selected / Active
→ Primary

Information / Utility
→ Secondary

Success / Saved / Complete
→ Tertiary

Warning
→ #B88732

Error / Delete
→ #B9473F
```

Do not switch these meanings between screens.

---

# 13. Typography Tone

Typography should feel calm and functional.

Preferred characteristics:

- Modern sans serif
- High readability
- Medium density
- Avoid playful display fonts in UI

If using Plus Jakarta Sans:

```text
Heading: 600–700
Body: 400–500
Label: 500–600
```

Avoid excessive bold usage.

---

# 14. Radius

Keep corners modern but controlled.

Recommended:

```text
Buttons: 10px
Tool rails: 14px
Cards / sheets: 12px
Popovers / large modals: 16px
```

Avoid fully rounded pill shapes everywhere.

Use pill only where the component is conceptually compact:

- Filter
- Status
- Counter chip
- Small selector

---

# 15. Shadows

Use shadows sparingly.

Recommended:

```css
--shadow-sm: 0 1px 3px rgba(44, 43, 39, 0.08);
--shadow-md: 0 8px 24px rgba(44, 43, 39, 0.10);
```

Do not apply shadows to every component.

Prefer:

- Border
- Divider
- Surface contrast

before shadow.

---

# 16. Icon Styling

Icons should be:

- Simple
- Outline-first
- Consistent stroke weight
- 18–20px visual size for standard UI
- 20–22px for important controls
- Large invisible hit target

Recommended hit target:

```text
Minimum interactive area: 44px
```

Do not color every icon.

Inactive icons:

```text
#666B60
```

Active:

```text
#47613F
```

Utility / informational:

```text
#4F6B7A
```

---

# 17. Do Not Introduce New Brand Colors

When generating code:

**Do not create new accent colors without explicit approval.**

Forbidden examples:

```text
#7B61FF
#FF4F9A
#0099FF
#00C853
```

unless a specific functional requirement has been approved and added to this file.

If a new color is needed:

1. Check whether an existing semantic token can be used.
2. Reuse an existing color if possible.
3. Only add a new token after updating this file.

---

# 18. Do Not Change Existing Colors During Refactor

Refactoring code must not change the design system.

When modifying:

- component structure
- CSS architecture
- responsive layout
- state management
- framework
- theme implementation

the visual tokens must remain unchanged.

Never replace existing colors with framework defaults.

Examples of prohibited accidental replacements:

```text
Primary → Bootstrap blue
Selected → Tailwind indigo
Success → generic green
Danger → framework red
```

Use this design system instead.

---

# 19. Framework Rule

If using Tailwind, map project colors into the theme.

Example:

```js
colors: {
  primary: '#47613F',
  secondary: '#4F6B7A',
  tertiary: '#3D705C',
  background: '#F7F4EE',
  surface: '#FFFCF7',
  viewerBackground: '#E9E6DF',
  selectedBackground: '#E6EDE0',
  text: '#2E332D',
  textSecondary: '#666B60',
  border: '#E5DDD2',
}
```

Do not use default Tailwind `blue-*`, `indigo-*`, `emerald-*`, etc. for core UI states.

If using MUI / Chakra / Bootstrap / another framework:

override the theme first.

Do not let framework defaults determine the product color system.

---

# 20. Vibe Coding Instructions

Before generating or modifying UI code:

1. Read `design_system.md`.
2. Reuse the defined semantic tokens.
3. Do not invent new brand colors.
4. Use the latest approved palette in section 22.
5. Preserve Viewer neutrality.
6. Use Primary only for important interaction.
7. Use Secondary for utility/navigation.
8. Use Tertiary for progress/success.
9. Keep decorative color usage minimal.
10. Maintain the same tone across web, tablet, and mobile.

---

# 21. Settings Popovers and Functional Colors

- A settings popover opens from its associated button. A pointer action outside both that button and the popover closes it; interactions inside either remain usable.
- Escape closes the active settings popover and returns focus to its opening button.
- Use the semantic color tokens and approved functional presets for progress lines, annotations, and counters. Keep existing saved colors intact when loading older work.
- Keep yarn colors user-selectable in Colorwork and Chart because those colors represent project materials rather than UI state.
- The counter work panel remains available while the user clicks the PDF. Its nested settings and add menus close when dismissed outside their own controls.
- Tapping a progress or reference line opens its style popup beside the line. A 450ms long press opens the same popup; movement beyond 8px keeps the direct drag behavior. The ellipsis button remains for line options.

When uncertain:

> Prefer neutral UI with one controlled accent rather than adding another color.

---

# 22. Current Approved Palette

```text
Primary
#47613F
Olive Green

Secondary
#4F6B7A
Muted Steel Blue

Tertiary
#3D705C
Deep Teal Green

Neutral / Background
#F7F4EE
Warm Background

Surface
#FFFCF7
Soft White

Viewer Background
#E9E6DF
Neutral Canvas Surround

Selected Background
#E6EDE0
Soft Olive

Primary Text
#2E332D
Craft Charcoal

Secondary Text
#666B60
Muted Olive Gray

Border
#E5DDD2
Warm Border

Progress Status
#D46A4C
Warm Coral

Progress Line Default
#EC4899
Pink

Danger
#B9473F

Warning
#B88732
```

## 2026-10-14 Viewer Style Popovers

- Keep the function toolbar on the left and the draggable counter/timer floating bar in its existing position. Do not show a separate property bar under the header.
- Pen and highlighter selection opens the existing style popover while leaving the drawing tool active. The first canvas action closes the popover.
- A short tap or 450ms long press on a progress or reference line opens its style popup beside the line; movement beyond 8px keeps the direct drag behavior. The ellipsis button remains for line options.
- Use the same approved two-row, five-column ten-color palette in all drawing and line style popovers. Stack thickness and opacity labels above full-width sliders aligned to the five color columns, with 44px touch areas.
- Preserve saved colors, line drag, split view, and existing save/backup formats.

---

# 23. Design Principle Summary

The visual system should communicate:

> **Warm craft + serious work tool**

Not:

> Cute knitting app

Not:

> Generic SaaS dashboard

Not:

> Colorful PDF editor

The product should feel calm enough to remain open beside the user for a long knitting session.

The pattern is always the visual priority.

The interface should support the work, not compete with it.

## 24. Viewer Style Popovers and Line Interaction (2026-10-14)

Use the existing right-side style popover for pen and highlighter settings; selecting the tool opens it together with the drawing mode, and the first canvas action closes it. Do not render a separate contextual property bar below the header.

A short tap or 450ms long press on a progress or reference line opens that line's style popup beside it. Cancel the hold when movement passes 8px so line movement and handle resizing stay direct. Keep the ellipsis button for marker, counter connection, reference, and delete options. Clamp the popup within the page area and return focus to the line on Escape.

Use the two-row, five-column approved palette from section 7 in drawing and line style popovers. Place thickness and opacity labels above horizontal sliders whose width matches the five color columns. Keep color and slider hit areas at least 44px, preserve saved colors, and retain the current data and backup formats.


## 4. Shared interaction polish (2026-10-13)

Keep the established semantic colors and page composition. Use the shared 4, 8, 12, 16, 24, and 32px spacing rhythm, 44px minimum touch targets, 16px text-entry sizing on coarse-pointer devices, visible keyboard focus, and existing lucide-react SVG icons for function controls. Preserve desktop density where larger targets are unnecessary. Touch devices must not retain hover-only visual states.

Animate only the entrance of menus, popovers, and dialogs with a short opacity/transform transition (about 150ms); honor prefers-reduced-motion. Do not animate frequent counter changes, page navigation, zoom, thumbnail collapse, or layout dimensions. Keep PDF work surfaces neutral and retain existing brand and semantic color tokens.

Verification on 2026-10-13: automated checks and builds passed; browser checks covered Home, Chart editor, Viewer at four viewport sizes, language switching, and portable HTTP entry. Physical tablet/touch testing and all locale/screen combinations remain separate validation work.
