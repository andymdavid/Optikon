# Optikon

Miro-like infinite canvas application focused on realtime collaboration, drawing, and structured boards. This codebase is actively evolving and is not production-ready.

## What this project is

- An infinite canvas with shared board state.
- Emphasis on realtime collaboration (presence + live updates).
- Boards are structured objects (metadata + persisted elements), not just ad-hoc local sketches.

## Architecture overview

- Frontend: React + a Canvas-based renderer.
- Core canvas: `frontend/src/components/CanvasBoard.tsx`.
- Backend: Bun server + SQLite in `src/server.ts` and `src/db.ts`.
- Realtime: WebSockets at `/ws` broadcast element updates and cursor presence.
- Persistence: board and element state is stored server-side in SQLite.

Useful starting points:

- `frontend/src/components/CanvasBoard.tsx`
- `frontend/src/pages/BoardsHome.tsx`
- `frontend/src/pages/CanvasPage.tsx`
- `src/server.ts`
- `src/routes/boards.ts`
- `src/services/boards.ts`
- `src/shared/boardElements.ts`
- `docs/structure.md`
- `docs/data_model.md`

## Board model and persistence

- Boards are identified by numeric IDs.
- Board list: `/`
- Board canvas: `/b/:boardId`
- Boards and elements are loaded from the server via `/boards` and `/boards/:id/elements`.
- Board metadata includes `last_accessed_at`, `updated_at`, `starred`, `archived_at`, and ownership/default role fields.
- Board element data is persisted per board in SQLite (`board_elements`).
- Board state is not stored in `localStorage` (aside from small UX helpers like "recent board").

## Canvas concepts (high level)

- Shared schema: `BoardElement` in `src/shared/boardElements.ts` (shapes, text, sticky notes, frames, lines/connectors, images, comments, free draw).
- Camera model: pan via camera offsets and zoom via a scalar zoom factor.
- Tool modes (examples): select, shapes, text, connectors, comments, and drawing/eraser flows.
- Orthogonal connectors exist (`orthogonal`, elbow variants/offsets), but routing is still evolving.

## Auth and identity (current state)

- Authentication is Nostr-based (signed login events).
- Sessions are cookie-based (`nostr_session`).
- Session records are currently persisted in SQLite (`sessions` table).
- Identity is only partially wired into canvas features (for example, element authorship/comment identity is still shallow).

Relevant files:

- `src/services/auth.ts`
- `frontend/src/components/account/NostrLoginModal.tsx`

## Running locally

Prerequisites:

- Bun 1.x
- Ports `3025` (backend) and `5510` (frontend) available

Install dependencies from the repo root:

```bash
bun install
```

Run both backend and frontend in dev mode:

```bash
bun run dev
```

Notes:

- Backend: `http://localhost:3025`
- Frontend (Vite): `http://localhost:5510`
- The frontend currently targets `http://localhost:3025` directly in `frontend/src/App.tsx`.
- SQLite defaults to `do-the-other-stuff.sqlite` in the repo root.
- To reset the database:

```bash
bun run reset-db
```

## Development checks

From the repo root:

```bash
bun run lint
bun test
```

TypeScript checking for the frontend is part of the frontend build:

```bash
bun run --cwd frontend build
```
