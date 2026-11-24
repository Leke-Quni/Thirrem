# Design

Chosen with the owner from three mocked options: **Premium & cinematic**, **purple accent**, **dark first with a light toggle**. Tokens live in `packages/ui/src/theme.css` and are shared by all three apps.

## Look

- Near-black background with a soft accent glow at the top right. Glass panels: translucent card fill, 1px border, backdrop blur.
- Rounded but not soft: 16px panels, 12px buttons and inputs.
- Maps are dark and low-contrast so the route line is the brightest thing on screen.

## Type

- Headings: Sora, weight 600, tight tracking (-0.035em).
- Body: Inter.
- Fonts are self-hosted through `@fontsource-variable`, with no third-party font requests.

## Colour

| Token | Dark | Light | Use |
|---|---|---|---|
| `--accent` | `#8b5cf6` | `#8b5cf6` | Route lines, pins, glows, decorative marks |
| `--accent-solid` | `#7c3aed` | `#7c3aed` | Button fills with white text (5.7:1 contrast) |
| `--accent-text` | `#a78bfa` | `#6d28d9` | Links and accent words on the page background |

`#8b5cf6` with white text is only 4.2:1, so it is never used behind text. Use `--accent-solid` for fills.

## Theme

`<html data-theme="dark|light">`, dark by default. The choice is stored in `localStorage` under `thirrem-theme` and applied by an inline script in `index.html` before first paint, so there is no flash.

## Rules

- Respect `prefers-reduced-motion`.
- Visible focus ring on every interactive element (3px accent outline).
- Never present the simulation as a real service, and never invent figures in the UI. Sample content is labelled as an example.
