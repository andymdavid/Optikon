# Do the Other Stuff

Minimal todo tracker powered by Bun, TypeScript, and SQLite. Runs as a single Bun server that renders HTML directly, so applying a custom skin is just a matter of swapping out styles.

## Getting started

```bash
bun install
PORT=4000 bun start
```

`bun start` runs `src/server.ts`, which boots `Bun.serve` on `PORT` (defaults to `3025`). The app creates `do-the-other-stuff.sqlite` the first time it runs.

## Features

- Add todos with the input at the top of the page.
- Toggle completion using the `Done` / `Undo` button next to each item.
- Remove items entirely with `Delete`.
- Remaining count updates automatically based on completed items.

The UI is intentionally unstyled beyond a bare minimum so you can drop in any look you want.

## Skinning approach

Everything renders from `renderPage` in `src/server.ts`. The markup uses consistent hooks:

- `.app-shell`: Wraps the entire interface.
- `.todo-form`, `.todo-list`, `.todo-item`, `.todo-title`, `.actions`: Provide structure for layout tweaks.
- `.done` class sits on completed `li` items.

To build a custom skin you can:

1. Copy the `<style>` block in `renderPage` into a separate CSS file.
2. Replace the inline styles with `<link rel="stylesheet" href="/app.css" />` and serve static assets any way you prefer (e.g., add a tiny `Bun.file` handler).
3. Adjust typography, colors, spacing, or even replace the markup while keeping the form routes (`/todos`, `/todos/:id/toggle`, `/todos/:id/delete`) intact.

Because the app is framework-free HTML, you can also render from a template engine or component system later without changing the persistence layer.

## Development helpers

- `bun start` runs the Bun backend only (`bun --hot run src/server.ts`).
- `bun run dev` from the repo root launches both servers: backend at http://localhost:3025 and the Vite frontend at http://localhost:5510. Visit the Vite URL during development to use the Canvas UI.
- `bun run reset-db` removes the SQLite file if you want to start fresh.

## Folder layout

```
src/
  db.ts        // sqlite helpers
  server.ts    // Bun HTTP server + HTML rendering
```
