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
| Primary | Moss Olive | `#4B6334` | Primary actions, selected states, active controls |
| Secondary | Muted Steel Blue | `#4F6B7A` | Secondary actions, information controls, page/navigation utility |
| Tertiary | Deep Teal Green | `#3D705C` | Progress, completion, positive state, supporting functional accents |
| Neutral | Warm Off White | `#FBF9F5` | Main app surface and warm neutral background |
| Text | Warm Charcoal | `#2C2B27` | Primary text |

---

# 3. Semantic Color Roles

Use semantic roles in code instead of arbitrary hex values.

Recommended token structure:

```css
:root {
  --color-primary: #4B6334;
  --color-secondary: #4F6B7A;
  --color-tertiary: #3D705C;

  --color-bg: #FBF9F5;
  --color-surface: #FFFFFF;
  --color-surface-subtle: #F4F1EC;

  --color-text-primary: #2C2B27;
  --color-text-secondary: #6E6A64;
  --color-text-muted: #918B84;

  --color-border: #E4DED6;
  --color-divider: #ECE6DF;

  --color-primary-hover: #40552C;
  --color-primary-pressed: #354624;
  --color-primary-soft: #E9EEE4;

  --color-secondary-hover: #435D69;
  --color-secondary-soft: #E9EEF1;

  --color-tertiary-soft: #E5F0EB;

  --color-danger: #B9473F;
  --color-danger-soft: #F7E9E6;

  --color-warning: #B88732;
  --color-warning-soft: #F6EEDC;

  --color-focus-ring: #4B6334;
}
```

Do not use raw hex values directly inside components when a semantic token exists.

Bad:

```css
button {
  background: #4B6334;
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

## Primary — `#4B6334`

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

The progress line is a work-state element, not a general annotation.

Default progress line should use a dedicated high-visibility accent derived from the design system.

Recommended default:

```css
--color-progress-line: #D46A4C;
```

This is intentionally warmer than the main green system because the line must remain easy to locate over monochrome knitting charts.

Rules:

- Progress line must remain visually distinct from Primary.
- Do not use neon pink, bright blue, or arbitrary accent colors.
- User-selectable progress-line presets may exist later, but the default must remain controlled by this system.
- Progress-line color should not become the global app accent.

---

# 7. Annotation Colors

Annotation colors are functional tools and may use a small controlled preset.

Recommended preset only:

```text
Dark Ink      #2C2B27
Warm Red      #C85E4B
Muted Blue    #557A95
Muted Green   #5C8167
Soft Purple   #7A6A94
Gray          #7D7A76
```

Do not add an unrestricted color picker by default.

Highlighter preset should use lower-opacity versions of controlled colors.

---

# 8. Surface Hierarchy

Use surface contrast instead of excessive borders and shadows.

Recommended hierarchy:

```text
App background
#FBF9F5

Main surface
#FFFFFF

Subtle grouped surface
#F4F1EC

Border
#E4DED6

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
#2C2B27

Secondary text
#6E6A64

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
Background: #4B6334
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
Small controls: 8px
Buttons: 8–10px
Cards / sheets: 12–16px
Large modals: 16px
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
Minimum interactive area: 40–44px
```

Do not color every icon.

Inactive icons:

```text
#6E6A64
```

Active:

```text
#4B6334
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
  primary: '#4B6334',
  secondary: '#4F6B7A',
  tertiary: '#3D705C',
  background: '#FBF9F5',
  text: '#2C2B27',
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
4. Do not change Primary / Secondary / Tertiary values.
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
- Progress-line style settings open from the dedicated palette button beside the line options button.

When uncertain:

> Prefer neutral UI with one controlled accent rather than adding another color.

---

# 22. Current Approved Palette

```text
Primary
#4B6334
Moss Olive

Secondary
#4F6B7A
Muted Steel Blue

Tertiary
#3D705C
Deep Teal Green

Neutral / Background
#FBF9F5
Warm Off White

Primary Text
#2C2B27
Warm Charcoal

Progress Line
#D46A4C
Warm Coral

Danger
#B9473F

Warning
#B88732
```

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
