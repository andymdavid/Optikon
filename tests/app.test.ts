import { rm } from "fs/promises";
import { join } from "path";

import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import * as pure from "nostr-tools/pure";

const TEST_DB_PATH = join(import.meta.dir, "tmp-test.sqlite");
await rm(TEST_DB_PATH, { force: true });
process.env.DB_PATH = TEST_DB_PATH;

const db = await import("../src/db");
const todos = await import("../src/services/todos");
const boards = await import("../src/services/boards");
const boardAccess = await import("../src/services/boardAccess");
const boardRoutes = await import("../src/routes/boards");
const { AuthService } = await import("../src/services/auth");

const OWNER = "npub1testowner";
const OWNER_PUBKEY = "pubkey-owner";
const OWNER_NPUB = "npub-owner";
const OTHER_PUBKEY = "pubkey-other";
const OTHER_NPUB = "npub-other";
const APP_TAG = "other-stuff-to-do";
const LOGIN_EVENT_KIND = 27235;

beforeEach(async () => {
  await db.resetDatabase();
});

describe("todo services", () => {
  test("creates todos and enforces allowed transitions", () => {
    const created = todos.quickAddTodo(OWNER, "Write tests", "");
    expect(created).toBeTruthy();
    const ready = todos.transitionTodoState(OWNER, created!.id, "ready");
    expect(ready?.state).toBe("ready");
    const invalid = todos.transitionTodoState(OWNER, created!.id, "new");
    expect(invalid).toBeNull();
  });

  test("bulk task creation validates input", () => {
    const { created, failed } = todos.createTodosFromTasks(OWNER, [
      { title: "Ship feature", priority: "rock" },
      { title: "   ", state: "done" },
    ]);
    expect(created.length).toBe(1);
    expect(failed.length).toBe(1);
    expect(failed[0].reason).toContain("Missing");
  });
});

describe("auth service", () => {
  test("accepts a signed login event with matching tags", async () => {
    const authService = new AuthService("test_session", APP_TAG, LOGIN_EVENT_KIND, 120, false, 3600);
    const event = pure.finalizeEvent(
      {
        kind: LOGIN_EVENT_KIND,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ["app", APP_TAG],
          ["method", "ephemeral"],
        ],
        content: "Authenticate with Other Stuff To Do",
      },
      pure.generateSecretKey()
    );

    const response = authService.login("ephemeral", event as any);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.npub).toBeDefined();
  });

  test("rejects login events without method tag", () => {
    const authService = new AuthService("test_session", APP_TAG, LOGIN_EVENT_KIND, 120, false, 3600);
    const event = pure.finalizeEvent(
      {
        kind: LOGIN_EVENT_KIND,
        created_at: Math.floor(Date.now() / 1000),
        tags: [["app", APP_TAG]],
        content: "Authenticate with Other Stuff To Do",
      },
      pure.generateSecretKey()
    );

    const response = authService.login("ephemeral", event as any);
    expect(response.status).toBe(422);
  });
});

describe("board access", () => {
  test("private board access is owner-only", () => {
    const board = boards.createBoardRecord(
      "Private Board",
      null,
      { pubkey: OWNER_PUBKEY, npub: OWNER_NPUB },
      "editor",
      1
    );
    const ownerSession = {
      token: "t-owner",
      pubkey: OWNER_PUBKEY,
      npub: OWNER_NPUB,
      method: "ephemeral" as const,
      createdAt: Date.now(),
    };
    const otherSession = {
      token: "t-other",
      pubkey: OTHER_PUBKEY,
      npub: OTHER_NPUB,
      method: "ephemeral" as const,
      createdAt: Date.now(),
    };
    expect(boardAccess.canViewBoard(board!, ownerSession)).toBe(true);
    expect(boardAccess.canViewBoard(board!, otherSession)).toBe(false);
  });

  test("private boards remain owner-only even with board members", () => {
    const board = boards.createBoardRecord(
      "Private Members",
      null,
      { pubkey: OWNER_PUBKEY, npub: OWNER_NPUB },
      "viewer",
      1
    );
    boards.upsertBoardMemberRecord(board!.id, OTHER_PUBKEY, "commenter");
    const memberSession = {
      token: "t-member",
      pubkey: OTHER_PUBKEY,
      npub: OTHER_NPUB,
      method: "ephemeral" as const,
      createdAt: Date.now(),
    };
    expect(boardAccess.canViewBoard(board!, memberSession)).toBe(false);
    expect(boardAccess.resolveBoardRole(board!, memberSession)).toBe("viewer");
  });

  test("export requires editor or owner", () => {
    const ownerBoard = boards.createBoardRecord(
      "Owner Export",
      null,
      { pubkey: OWNER_PUBKEY, npub: OWNER_NPUB },
      "viewer",
      0
    );
    const ownerSession = {
      token: "t-owner",
      pubkey: OWNER_PUBKEY,
      npub: OWNER_NPUB,
      method: "ephemeral" as const,
      createdAt: Date.now(),
    };
    const ownerExport = boardRoutes.handleBoardExport(ownerBoard!.id, ownerSession);
    expect(ownerExport.status).toBe(200);

    const viewerBoard = boards.createBoardRecord(
      "Viewer Export",
      null,
      { pubkey: OWNER_PUBKEY, npub: OWNER_NPUB },
      "viewer",
      0
    );
    const viewerSession = {
      token: "t-viewer",
      pubkey: OTHER_PUBKEY,
      npub: OTHER_NPUB,
      method: "ephemeral" as const,
      createdAt: Date.now(),
    };
    const viewerExport = boardRoutes.handleBoardExport(viewerBoard!.id, viewerSession);
    expect(viewerExport.status).toBe(403);

    const editorBoard = boards.createBoardRecord(
      "Editor Export",
      null,
      { pubkey: OWNER_PUBKEY, npub: OWNER_NPUB },
      "editor",
      0
    );
    const editorExport = boardRoutes.handleBoardExport(editorBoard!.id, viewerSession);
    expect(editorExport.status).toBe(200);
  });

  test("import creates board, elements, and remaps ids", async () => {
    const session = {
      token: "t-import",
      pubkey: OWNER_PUBKEY,
      npub: OWNER_NPUB,
      method: "ephemeral" as const,
      createdAt: Date.now(),
    };
    const payload = {
      board: {
        title: "Sample Board",
        description: "Test import",
        defaultRole: "editor",
        isPrivate: false,
      },
      elements: [
        { id: "orig-1", type: "sticky", x: 10, y: 10, text: "A", size: 200 },
        { id: "orig-2", type: "text", x: 20, y: 20, text: "B", fontSize: 16 },
      ],
      attachments: [],
    };
    const req = new Request("http://localhost/boards/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const response = await boardRoutes.handleBoardImport(req, session);
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.title).toBe("Imported - Sample Board");
    const createdBoard = boards.fetchBoardById(body.id);
    expect(createdBoard?.title).toBe("Imported - Sample Board");

    const rows = boards.fetchBoardElements(body.id);
    expect(rows.length).toBe(2);
    const ids = rows.map((row) => {
      const parsed = JSON.parse(row.props_json) as { id?: string };
      return parsed.id ?? "";
    });
    expect(new Set(ids).size).toBe(2);
    expect(ids).not.toContain("orig-1");
    expect(ids).not.toContain("orig-2");
  });

  test("leave hides board for non-owner and blocks owner", async () => {
    const board = boards.createBoardRecord(
      "Leave Board",
      null,
      { pubkey: OWNER_PUBKEY, npub: OWNER_NPUB },
      "viewer",
      0
    );
    const ownerSession = {
      token: "t-owner",
      pubkey: OWNER_PUBKEY,
      npub: OWNER_NPUB,
      method: "ephemeral" as const,
      createdAt: Date.now(),
    };
    const otherSession = {
      token: "t-other",
      pubkey: OTHER_PUBKEY,
      npub: OTHER_NPUB,
      method: "ephemeral" as const,
      createdAt: Date.now(),
    };
    const leaveOwner = boardRoutes.handleBoardLeave(board!.id, ownerSession);
    expect(leaveOwner.status).toBe(403);

    const leaveOther = boardRoutes.handleBoardLeave(board!.id, otherSession);
    expect(leaveOther.status).toBe(200);

    const listResponse = boardRoutes.handleBoardsList(
      new URL("http://localhost/boards"),
      {},
      otherSession
    );
    const listBody = await listResponse.json();
    const listedIds = listBody.boards.map((item: { id: number }) => item.id);
    expect(listedIds).not.toContain(board!.id);
  });
});

afterAll(async () => {
  await rm(TEST_DB_PATH, { force: true });
});
