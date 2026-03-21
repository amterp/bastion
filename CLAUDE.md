# Bastion

Chromium extension (Manifest V3) for focus and habit-breaking. Targets Edge.

## Build

```sh
npm run build       # Build to dist/
npm run watch       # Watch mode
npm run typecheck   # Type check (no emit)
npm run test        # Run tests
```

## Load in browser

1. Go to `edge://extensions`
2. Enable Developer mode
3. Load unpacked from `dist/`

## Architecture

- `src/background/` - Service worker (MV3)
- `src/content/` - Content scripts (experience degradation)
- `src/controls/` - Pluggable control system (evaluators are pure functions)
- `src/storage/` - Chrome storage abstraction
- `src/shared/` - Types, utilities
- `src/ui/` - Extension pages (popup, options, blocked, speed-bump)
- `static/` - manifest.json, icons (copied to dist)

## Tech stack

TypeScript + vanilla DOM. esbuild for bundling. vitest for testing.
No runtime dependencies.
