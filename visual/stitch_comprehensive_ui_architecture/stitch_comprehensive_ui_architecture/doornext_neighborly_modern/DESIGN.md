---
name: DoorNext Neighborly Modern
colors:
  surface: '#fff8f6'
  surface-dim: '#eed5cc'
  surface-bright: '#fff8f6'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#fff1ec'
  surface-container: '#ffe9e2'
  surface-container-high: '#fde3da'
  surface-container-highest: '#f7ddd4'
  on-surface: '#261813'
  on-surface-variant: '#594138'
  inverse-surface: '#3c2d27'
  inverse-on-surface: '#ffede7'
  outline: '#8d7166'
  outline-variant: '#e1bfb3'
  surface-tint: '#a63b00'
  primary: '#a63b00'
  on-primary: '#ffffff'
  primary-container: '#f26522'
  on-primary-container: '#4f1800'
  inverse-primary: '#ffb599'
  secondary: '#5f5e5e'
  on-secondary: '#ffffff'
  secondary-container: '#e5e2e1'
  on-secondary-container: '#656464'
  tertiary: '#006492'
  on-tertiary: '#ffffff'
  tertiary-container: '#009ade'
  on-tertiary-container: '#002d45'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdbce'
  primary-fixed-dim: '#ffb599'
  on-primary-fixed: '#370e00'
  on-primary-fixed-variant: '#7f2b00'
  secondary-fixed: '#e5e2e1'
  secondary-fixed-dim: '#c9c6c5'
  on-secondary-fixed: '#1c1b1b'
  on-secondary-fixed-variant: '#474646'
  tertiary-fixed: '#cae6ff'
  tertiary-fixed-dim: '#8cceff'
  on-tertiary-fixed: '#001e2f'
  on-tertiary-fixed-variant: '#004b6f'
  background: '#fff8f6'
  on-background: '#261813'
  surface-variant: '#f7ddd4'
  surface-cream: '#FDFCFB'
  neighborhood-green: '#2D6A4F'
  warm-gray: '#736F6E'
typography:
  display-lg:
    fontFamily: Anybody
    fontSize: 48px
    fontWeight: '800'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Anybody
    fontSize: 36px
    fontWeight: '800'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Anybody
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
  headline-md-mobile:
    fontFamily: Anybody
    fontSize: 24px
    fontWeight: '700'
    lineHeight: '1.2'
  title-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: '1.4'
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1.0'
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  container-padding-mobile: 1.25rem
  container-padding-desktop: 2.5rem
  gutter: 1.5rem
  section-gap: 4rem
---

## Brand & Style

The brand personality is **warm, neighborly, and anti-corporate**. It aims to feel like a community utility rather than a Silicon Valley extraction tool. The design style is **Corporate Modern infused with Tactile warmth**—it maintains the reliability of a logistics platform while using soft edges, human-centric photography, and a vibrant, "home-cooked" energy to differentiate from sterile competitors.

The goal is to evoke **trust and local pride**. The UI should feel high-end but accessible, emphasizing that users are buying from neighbors (DoorMakers) and supported by local drivers (Nexters).

**Key Stylistic Principles:**
- **Human over Algorithmic:** Use photography of real people and food, avoiding generic 3D illustrations.
- **Generous Breathing Room:** High whitespace to reduce "delivery app anxiety" and decision fatigue.
- **Organic Geometry:** Heavy use of large corner radii to feel soft and approachable.

## Colors

The palette is centered around the **DoorNext Orange**, a high-energy, appetizing hue that signals movement and warmth. This is grounded by **Deep Black** for high-contrast typography and professional reliability.

- **Primary (Orange):** Used for primary actions, branding elements, and progress indicators.
- **Secondary (Deep Black):** Used for headings and primary buttons to provide a "premium" grounding.
- **Neutral (Cream/Soft Gray):** Instead of pure white, use a very subtle cream (`#FDFCFB`) for backgrounds to soften the digital glare and feel more organic.
- **Semantic Colors:** Use `neighborhood-green` for success states and earnings, reinforcing the "growth" of the local economy.

## Typography

The typography strategy balances **expressive character** with **utilitarian clarity**.

- **Headlines:** Use **Anybody**. Its variable-width influence and bold weights feel modern, urgent, and un-corporate. It creates a "poster" aesthetic for marketing and section headers.
- **Body:** Use **Plus Jakarta Sans**. It is friendly and highly legible at small sizes, with a slightly rounded structure that fits the "neighborly" brand.
- **Technical/Utility:** Use **JetBrains Mono** for status labels, order IDs, and distances (e.g., "2.4 mi"). This introduces a "logistics" feel that builds trust in the platform's precision without feeling cold.

## Layout & Spacing

The design system utilizes a **Fluid Grid** with generous inner margins to ensure content feels curated rather than crowded.

- **Desktop:** 12-column grid, max-width 1280px.
- **Mobile:** Single column with `1.25rem` safe-area padding.
- **Rhythm:** Use an 8px base unit. Gaps between related items (like menu cards) should be `gutter` (24px), while major sections should be separated by `section-gap` (64px) to emphasize the "Minimalist" clarity.
- **Information Hierarchy:** Vital delivery data (Time, Price, Distance) should always have a dedicated "utility row" using the Label font style to separate it from descriptive content.

## Elevation & Depth

To maintain a "modern yet human" feel, the system avoids heavy drop shadows in favor of **Tonal Layers** and **Soft Ambient Shadows**.

- **Surface Levels:** 
  - Level 0 (Background): Cream (`#FDFCFB`).
  - Level 1 (Cards): Pure White (`#FFFFFF`).
  - Level 2 (Floating/Modals): Pure White with a very soft, large-radius shadow (Color: `Primary Orange`, Opacity: 8%, Blur: 30px).
- **Interactive States:** Buttons should use a slight vertical offset (2px) when hovered to feel "clickable" and tactile, rather than just changing color.
- **Borders:** Use thin, low-contrast borders (`1px solid #E5E5E5`) for card definitions on desktop, but rely on tonal shifts for mobile.

## Shapes

The shape language is defined by **pronounced roundness**. 

- **Cards & Containers:** Use `rounded-xl` (1.5rem / 24px) to create a friendly, "bubbly" container feel.
- **Buttons:** Use `pill-shaped` for primary actions (Order, Go Online) to make them feel inviting and easy to tap on mobile.
- **Images:** All food and profile photography must have a minimum of `1rem` corner radius; never use sharp-edged imagery.
- **Small Elements:** Chips and badges (e.g., "Cottage Licensed") use a `rounded-lg` (1rem) radius.

## Components

### Buttons
- **Primary:** Background `Primary Orange`, Text `White`, Pill-shaped. 
- **Secondary:** Background `Deep Black`, Text `White`, Pill-shaped. Used for high-priority secondary actions (e.g., "Add to Cart").
- **Tertiary:** Transparent background, `Deep Black` text with a bottom underline or icon.

### Cards (DoorMaker & Items)
- White background, `rounded-xl` corners.
- Subtle `1px` border in light gray.
- **DoorMaker Card:** Feature a large circular or rounded-square avatar of the seller to emphasize the human connection.

### Input Fields
- Background should be a slightly darker neutral than the page background.
- `rounded-lg` corners.
- Focus state: `2px` solid `Primary Orange`.

### Chips / Badges
- Used for categories (e.g., "Pupusas", "Home-made").
- Subtle cream background with `Secondary` text.
- Monospaced `label-sm` typography.

### Wallet/Earnings Display
- High contrast. Use `Deep Black` background with `Primary Orange` or `Neighborhood Green` text for numbers.
- Uses `JetBrains Mono` for all currency figures to feel "ledger-accurate."