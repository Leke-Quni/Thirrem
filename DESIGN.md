# Design

Chosen with the owner from three mocked options: **Premium & cinematic**, **purple accent**, **dark first with a light toggle**. Tokens live in `packages/ui/src/theme.css` and are shared by all three apps. The landing, login and signup styles they share are in `packages/ui/src/pages.css`.

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

### Driver accent

The Driver app is teal, so a visitor with both apps open can tell them apart. Everything else matches the Rider app, with a "Driver" tag beside the logo. The overrides are at the top of `apps/driver/src/styles.css`.

| Token | Dark | Light |
|---|---|---|
| `--accent` | `#14b8a6` | `#0d9488` (3.3:1, for the focus ring) |
| `--accent-solid` | `#0f766e` | `#0f766e` (5.5:1 with white) |
| `--accent-text` | `#2dd4bf` | `#0f6b64` |

`#14b8a6` is only 2.5:1 with white, so it is never used behind text. Success green is close to teal, so success states also carry an icon or text.

## Theme

`<html data-theme="dark|light">`, dark by default. The choice is stored in `localStorage` under `thirrem-theme` and applied by an inline script in `index.html` before first paint, so there is no flash.

## Rules

- Respect `prefers-reduced-motion`.
- Visible focus ring on every interactive element (3px accent outline).
- Never present the simulation as a real service, and never invent figures in the UI. Sample content is labelled as an example.
