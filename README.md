# Bastion

A Chromium browser extension that helps you stay focused and break bad browsing habits - like checking Reddit every five minutes - through graduated friction rather than hard blocking.

## Philosophy

**Friction over punishment.** Bastion adds friction where autopilot takes over - a countdown before a page loads, a time budget that keeps you aware of usage, a grayscale filter that makes a site less appealing after dark. It doesn't shame you or lock you out entirely (unless you want that).

**Graduated responses.** Different habits need different tools. A hard time limit works for sites you genuinely overuse. A speed bump works for sites you visit compulsively but briefly. Grayscale works for sites that are fine during the day but toxic at night. These can be layered independently.

**Bypasses built in.** Every control can have a bypass policy - a limited number of escapes per day. The goal isn't perfection, it's keeping you on track.

**Calm, not hostile.** The UI is deliberately understated. When Bastion blocks you, it should feel like a gentle wall, not a siren - a reminder of a boundary you set for yourself.

## Controls

Each site can have any combination of these, independently configured:

- **Time Limit** - Cap your total time on a site within a rolling window (e.g. 30 minutes per 2 hours)
- **Nav Frequency** - Limit how often you can visit a site (e.g. 3 visits per hour) - targets the compulsive "open new tab, type URL" habit
- **Speed Bump** - A countdown page before the site loads (e.g. 10 seconds) - pure friction, no blocking
- **Degradation** - Worsen the experience (currently: grayscale filter) based on time of day or time spent on site

Each control can optionally have a **bypass policy**: N bypasses per time window (default: per day), each lasting M minutes.

## Setup

### Build

```sh
npm install
npm run build       # Build to dist/
npm run watch       # Watch mode
npm run typecheck   # Type check
npm run test        # Run tests
```

### Install in browser

1. Open `edge://extensions` (or `chrome://extensions`)
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `dist/` directory
4. Pin Bastion to your toolbar

### Configure

Click the Bastion icon, then the gear icon (or right-click and choose Options). Add a site, add controls, adjust thresholds.

## Architecture

Bastion is built as a Manifest V3 Chromium extension with TypeScript and vanilla DOM - no frameworks, no runtime dependencies.

### How it works

The **service worker** intercepts navigations via `webNavigation.onBeforeNavigate`. For each navigation to a configured site, it runs the URL through every enabled control's evaluator. The most restrictive result wins:

- `block` - Redirect to an interstitial page showing why and when access resets
- `speed-bump` - Redirect to a countdown page; after the countdown, a short-lived clearance token lets the real navigation through
- `degrade` - Allow the navigation but signal a content script to inject CSS (e.g. grayscale)
- `allow` - Do nothing

### Pluggable control system

Controls are designed to be easy to add. Each evaluator is a **pure function** - `(config, trackingData, now) => ControlResult` - with no Chrome API calls, making them trivially testable. Adding a new control type requires:

1. Add the type to the `ControlType` union in `src/shared/types.ts`
2. Create a config interface extending `ControlConfigBase`
3. Create an evaluator implementing `ControlEvaluator`
4. Register it in `src/controls/init.ts`

### Key design decisions

- **Async write mutex on tracking storage** - Multiple service worker event handlers can fire concurrently. A serialized write queue prevents read-modify-write races from dropping data.
- **Domain-based speed bump clearances** - Clearance tokens match by domain pattern, not exact URL, so HTTP-to-HTTPS redirects and www normalization don't break the flow.
- **1-minute heartbeat alarm** - The MV3 service worker can be terminated at any time. A recurring alarm flushes accumulated browsing time to storage, bounding worst-case data loss to about 1 minute.
- **Dynamic content script registration** - Degradation scripts are only injected into sites the user has configured, not every page.
- **Typed message bus** - All `chrome.runtime.sendMessage` communication uses a discriminated union (`BastionMessage`) for compile-time safety.

### Directory structure

```
src/
  background/       Service worker, navigation handler, time tracker, alarm handler
  content/          Content scripts (grayscale injection)
  controls/         Pluggable control system - registry, evaluator, per-type evaluators
  shared/           Types, constants, utilities, message schema
  storage/          Chrome storage abstraction with serialized writes
  ui/
    popup/          Toolbar popup - status summary, quick toggles
    options/        Full configuration page
    blocked/        Interstitial shown when a control blocks access
    speed-bump/     Countdown page shown before granting access
static/             manifest.json, icons (copied to dist/)
```

## Tech stack

- **TypeScript** - Strict mode, discriminated unions for config and result types
- **esbuild** - Fast bundling, zero config
- **vitest** - Unit tests for all pure logic (evaluators, time math, URL matching)
- **Vanilla DOM** - No framework for the UI pages
- **Manifest V3** - Modern Chromium extension APIs

## Status

Early development. Core functionality works. Not yet published to any extension store.
