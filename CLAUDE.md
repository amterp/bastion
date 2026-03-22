# Bastion

Chromium extension (Manifest V3) for staying focused and breaking bad
browsing habits through graduated friction. Targets Edge, works in any
Chromium browser.

## Project ethos

Bastion helps users stay on track. The design philosophy is:

- **Friction over punishment** - speed bumps, time budgets, grayscale;
  not just hard blocks
- **Graduated responses** - different habits need different tools,
  and controls can be layered independently per site
- **Bypasses built in** - perfection isn't the goal; staying on track is
- **Calm UX** - Stone & Sage palette (warm grays, muted green); the
  blocked page should feel like a gentle wall, not a siren

When making design decisions, lean toward respecting the user's autonomy
while still providing meaningful friction.

## Build & test

```sh
npm run build       # Build to dist/
npm run watch       # Watch mode
npm run typecheck   # Type check (tsc --noEmit)
npm run test        # Run vitest
```

Load in browser: `edge://extensions` -> Developer mode -> Load unpacked
from `dist/`.

## Architecture

- `src/background/` - MV3 service worker: navigation interception, time
  tracking (with 1-min heartbeat), alarm handler
- `src/content/` - Content scripts injected dynamically for degradation
- `src/controls/` - Pluggable control system. Each evaluator is a pure
  function: `(config, trackingData, now) => ControlResult`. No Chrome
  API calls in evaluators - they're trivially testable.
- `src/storage/` - Chrome storage abstraction. Tracking store writes go
  through an async mutex (`withTrackingStore`) to prevent concurrent
  event handlers from clobbering each other.
- `src/shared/` - Types (discriminated unions for configs, results, and
  messages), time/URL utilities, constants
- `src/ui/` - Extension pages: popup, options, blocked, speed-bump
- `static/` - manifest.json, icons (copied to dist by esbuild config)

## Key patterns

- **Discriminated unions everywhere** - `ControlConfig`, `ControlResult`,
  `DegradationTrigger`, `BastionMessage` all use TypeScript discriminated
  unions for compile-time safety
- **Pure evaluators** - Control logic is separated from Chrome APIs so it
  can be unit tested without mocking
- **Domain-based matching** - `matchesDomainPattern("reddit.com")` matches
  `reddit.com`, `www.reddit.com`, `old.reddit.com`. Speed bump clearances
  are also domain-based (not exact URL) to survive redirects.
- **Serialized storage writes** - The tracking store uses a Promise-chain
  mutex. Always use `mutateTrackingData()` for atomic read-modify-write.

## Adding a new control type

1. Add the type string to `ControlType` in `src/shared/types.ts`
2. Create a config interface extending `ControlConfigBase`
3. Create an evaluator implementing `ControlEvaluator` in
   `src/controls/<name>/evaluator.ts`
4. Register it in `src/controls/init.ts`
5. Add UI rendering in `src/ui/options/options.ts` (`renderControlFields`
   and `defaultControl`)

## Tech stack

TypeScript (strict), vanilla DOM, esbuild, vitest.
No runtime dependencies. No UI framework.

## Website

`docs/` contains a static single-page website (plain HTML + CSS, no build
step) intended for GitHub Pages. It documents Bastion's features, philosophy,
and usage guide.

When making user-facing changes to the extension - adding or modifying
control types, changing configuration options, adding features, or altering
behavior - update the website to reflect those changes. The relevant
sections are in `docs/index.html`:

- **Features** section: control type cards with descriptions and examples
- **Guide** section: detailed how-to covering installation, configuration,
  each control type, bypasses, and import/export

The site uses the Stone & Sage palette via CSS custom properties in
`docs/style.css`.

`docs/privacy.html` is the privacy policy linked from the Chrome Web
Store listing. When changes affect what data is collected, stored, or
how permissions are used, update the privacy policy to match.

## Tracking

This project uses a [Kan](https://github.com/amterp/kan) board in `.kan/`
to track development work. Keep the board up to date as you work - when
picking up, completing, or creating tasks, use the `kan` CLI to reflect
that (e.g. `kan add`, `kan edit <id> -c in-progress`, `kan list`). Run
`kan board describe` to see the board's columns, fields, and conventions.
