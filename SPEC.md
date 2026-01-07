Vision for Our Collaborative Canvas Feature

Our goal is to build an integrated visual collaboration workspace inside our business OS that captures the core experience of tools like Miro — enabling teams to visually brainstorm, plan, and execute work together in real time. At its heart, this workspace is not just a whiteboard: it’s an infinite, shared canvas where ideas become structured artifacts that can be revisited, organized, and acted upon — all without leaving the context of our platform.

Traditional static tools like documents or spreadsheets force users into linear thinking. In contrast, our visual collaboration workspace will allow users to capture thoughts as shapes, notes, diagrams, or sketches anywhere on an expansive canvas, then interact with them together in real time or asynchronously. This mirrors the way teams think and collaborate physically but moves it into the digital space with persistent state and shared access. Miro’s innovation workspace is a strong inspiration here: its ability to unify visual collaboration, real-time editing, and cross-functional teamwork in one shared space is what drives team alignment and creative output.  ￼

Our implementation will focus first on the core, non-negotiable capabilities that deliver the majority of daily value — a real-time, multiplayer canvas with basic objects and interactions — while leaving optional advanced features like templates, AI summarization, or enterprise integrations for future phases. The canvas will be part of the OS, letting users create and return to boards that persist over time, share them with colleagues, and build meaning together through structured visuals. Those visuals become the shared memory of team collaboration, replacing ad-hoc whiteboards that vanish after a meeting.  ￼

This vision isn’t about re-implementing every feature Miro offers; it’s about capturing the core experience of visual collaboration that unlocks creativity and alignment. We want boards that teams can jump into, sketch on, brainstorm together, capture ideas in context, and iterate — all with smooth realtime updates and persistence.

⸻

Core Features We’re Building (MVP Scope)

Here’s a clear list of the features targeted in the initial implementation:

1. Infinite Shared Canvas
A zoomable, pannable board where users can place visual elements anywhere, unrestricted by page boundaries. This replicates the feeling of a physical whiteboard but digitally persistent.  ￼

2. Basic Visual Elements
Users can add and edit:
	•	Sticky notes (text boxes)
	•	Simple shapes (rectangles, circles, lines)
	•	Free-draw strokes (pen tool)
	•	Text labels

These elements serve as fundamental building blocks for brainstorming and diagramming.  ￼

3. Realtime Collaboration & Presence
Multiple users connected to the same board will see each other’s changes live. This includes broadcasting object creation, movement, updates, and optionally, cursor presence indicators so collaborators can see where others are working.  ￼

4. Persistent Boards and Elements
Board state — including all elements and their properties — will be stored in SQLite so users can close and reopen boards, and others can load the same board state later. This persistence distinguishes our workspace from ephemeral whiteboards.  ￼

5. Commenting/Feedback
Users can attach comments to specific elements to discuss ideas and decisions directly in context. Comments persist and can be viewed asynchronously by others.  ￼

6. Scaling Tools & Navigation
Pan and zoom navigation, selection tools for moving/resizing objects, and basic camera controls make the canvas intuitive to navigate and manipulate.

PHASE 0 — BOOTSTRAP & FOUNDATIONAL SETUP

Goal: Transform your starter todo repo into a project scaffold that can support APIs, WebSockets, and a rich frontend.

You’ll keep:
	•	Bun + SQLite backend
	•	Nostr identity (as you said)

You’ll add:
	•	Frontend framework (React recommended)
	•	WebSocket support in Bun
	•	Folder structure for canvas features

Codex Prompts (Phase-0)

0.1 Setup React front end
	•	“Create a frontend/ folder in the repo and initialize a React + TypeScript application. Include HTML5 Canvas support.”
	•	“Add an initial page CanvasBoard.tsx that renders a full viewport <canvas> and installs basic camera (pan/zoom) state.”

0.2 Add WebSocket support
	•	“In the Bun backend, configure Bun.serve to support WebSockets with an event handler skeleton.”
	•	“Define WebSocket message types (JSON) for joinBoard, elementUpdate, cursorMove, syncRequest, and syncResponse.”

0.3 Update database schema
	•	“Extend the SQLite schema with tables: boards, board_elements, board_comments. Each board_element has: id, board_id, type, properties (JSON), created_at, updated_at.”

⸻

PHASE 1 — MINIMAL REALTIME CANVAS SYNC

Goal: Draw simple strokes and broadcast to other users in real time. Anyone connected to the same board sees line events immediately.

This is the simplest “collaboration” slice: users draw, everyone sees lines.

Codex Prompts (Phase-1)

1.1 Client event handling
	•	“Add mouse/touch event listeners to the canvas. Capture pointerdown, pointermove, and pointerup events. On pointermove while pressed, capture a minimal stroke point set { x, y }.”

1.2 Client WebSocket integration
	•	“Connect from the React canvas component to the Bun WebSocket server using the WebSocket browser API.”
	•	“On connect, send a joinBoard message with boardId and user identity.”

1.3 Server broadcast logic
	•	“In the Bun WebSocket handler, accept incoming elementUpdate messages and broadcast them to all connected clients in the same board session.”

1.4 Canvas replay
	•	“On receiving a broadcast stroke from WebSocket, update client state and render the stroke immediately on canvas.”

Test Cases for Phase-1
	•	Open two browsers, join the same board — drawing in one appears in the other in real time.

⸻

PHASE 2 — ELEMENT MODEL & PERSISTENCE

Goal: Convert raw stroke events into board elements so they can be saved/restored and managed like objects (not just raw paths).

Instead of just drawn lines, you’ll start treating strokes as elements with an identifier and properties.

Codex Prompts (Phase-2)

2.1 Element abstraction
	•	“Define an Element type in the frontend with { id, type, path, color, thickness }.”
	•	“Modify stroke handling so that a stroke becomes an element object with a unique ID.”

2.2 Persist elements
	•	“Add REST endpoints in Bun: POST /boards/:id/elements to save a new element. The endpoint persists element.properties (JSON) to board_elements table.”
	•	“Add GET /boards/:id/elements to load all elements for a board at initial load.”

2.3 Sync persisted state
	•	“On client join, make a REST request to load all saved elements for the board and draw them before joining realtime.”

Test Cases for Phase-2
	•	Reload a browser: previously drawn elements load from DB.
	•	Open a second browser: load + realtime both work together.

⸻

PHASE 3 — PAN/ZOOM + BASIC SHAPES

Goal: Make the canvas feel less like a sketchpad and more like a whiteboard: pan/zoom works reliably, and users can add/select/move primitive elements.

Codex Prompts (Phase-3)

3.1 Pan & zoom camera
	•	“Implement a ‘camera’ abstraction that maps screen coordinates to board coordinates. Support scroll wheel zoom and drag-to-pan.”

3.2 Shapes UI
	•	“Add simple shape tools (rectangle, circle, line). On user toolbar selection, clicking the canvas creates that shape with a minimal property set { x, y, width, height }.”

3.3 Element transform
	•	“Implement dragging and resizing shapes. Emit these transforms as elementUpdate WebSocket messages so others see the change.”

⸻

PHASE 4 — COMMENTS & BASIC UI

Goal: Support modal anchored comments on elements.

Codex Prompts (Phase-4)

4.1 Comment model
	•	“Extend the DB schema with board_comments, columns: id, element_id, author, text, created_at.”

4.2 UI
	•	“Add a comment sidebar. On selecting an element, show its comments and allow posting new ones.”

4.3 Persistence and sync
	•	“Expose REST GET /boards/:id/elements/:elementId/comments and POST /boards/:id/elements/:elementId/comments.”

⸻

PHASE 5 — CURSOR PRESENCE & SESSION STATES

Goal: Show where other users’ cursors are on the canvas.

Codex Prompts (Phase-5)

5.1 Broadcast cursor positions
	•	“From the client, emit cursorMove during pointermove events over canvas. The server relays these to all clients.”

5.2 Render cursors
	•	“On receiving peer cursor updates, draw small user-colored cursors above the canvas.”

⸻

Optional Phase 6 — PERMISSIONS & BOARD SHARING

Once the core realtime canvas works, you can add board permissions, export to image/PDF, and autosave snapshots.