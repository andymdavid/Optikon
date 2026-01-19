import { Database } from "bun:sqlite";

import type { TodoPriority, TodoState } from "./types";

export type Todo = {
  id: number;
  title: string;
  owner: string;
  description: string;
  priority: TodoPriority;
  state: TodoState;
  done: number;
  deleted: number;
  created_at: string;
  scheduled_for: string | null;
  tags: string;
};

export type Summary = {
  id: number;
  owner: string;
  summary_date: string;
  day_ahead: string | null;
  week_ahead: string | null;
  suggestions: string | null;
  created_at: string;
  updated_at: string;
};

export type Board = {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
  last_accessed_at: string | null;
  starred: number;
  archived_at: string | null;
  owner_pubkey: string | null;
  owner_npub: string | null;
};

export type BoardElement = {
  id: string;
  board_id: number;
  type: string;
  props_json: string;
  created_at: string;
  updated_at: string;
};

export type BoardComment = {
  id: number;
  element_id: number;
  author: string;
  text: string;
  created_at: string;
};

export type Attachment = {
  id: string;
  board_id: number;
  owner_pubkey: string | null;
  original_filename: string;
  mime_type: string;
  size: number;
  storage_path: string;
  public_url: string;
  created_at: string;
};

const db = new Database(Bun.env.DB_PATH || "do-the-other-stuff.sqlite");
db.run("PRAGMA foreign_keys = ON");

db.run(`
  CREATE TABLE IF NOT EXISTS todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

const addColumn = (sql: string) => {
  try {
    db.run(sql);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("duplicate column")) {
      throw error;
    }
  }
};

addColumn("ALTER TABLE todos ADD COLUMN description TEXT DEFAULT ''");
addColumn("ALTER TABLE todos ADD COLUMN priority TEXT NOT NULL DEFAULT 'sand'");
addColumn("ALTER TABLE todos ADD COLUMN state TEXT NOT NULL DEFAULT 'new'");
addColumn("ALTER TABLE todos ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0");
addColumn("ALTER TABLE todos ADD COLUMN owner TEXT NOT NULL DEFAULT ''");
addColumn("ALTER TABLE todos ADD COLUMN scheduled_for TEXT DEFAULT NULL");
addColumn("ALTER TABLE todos ADD COLUMN tags TEXT DEFAULT ''");

db.run(`
  CREATE TABLE IF NOT EXISTS ai_summaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner TEXT NOT NULL,
    summary_date TEXT NOT NULL,
    day_ahead TEXT NULL,
    week_ahead TEXT NULL,
    suggestions TEXT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(owner, summary_date)
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS boards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_accessed_at TEXT,
    starred INTEGER NOT NULL DEFAULT 0,
    archived_at TEXT,
    owner_pubkey TEXT NULL,
    owner_npub TEXT NULL
  )
`);

function ensureBoardsSchema() {
  const info = db.query<{ name: string }>(`PRAGMA table_info('boards')`).all();
  const hasUpdatedAt = info.some((column) => column.name === "updated_at");
  const hasLastAccessedAt = info.some((column) => column.name === "last_accessed_at");
  const hasStarred = info.some((column) => column.name === "starred");
  const hasArchivedAt = info.some((column) => column.name === "archived_at");
  const hasOwnerPubkey = info.some((column) => column.name === "owner_pubkey");
  const hasOwnerNpub = info.some((column) => column.name === "owner_npub");

  if (!hasUpdatedAt) {
    db.run(`ALTER TABLE boards ADD COLUMN updated_at TEXT`);
    db.run(`UPDATE boards SET updated_at = created_at WHERE updated_at IS NULL`);
  }

  if (!hasLastAccessedAt) {
    db.run(`ALTER TABLE boards ADD COLUMN last_accessed_at TEXT`);
  }

  if (!hasStarred) {
    db.run(`ALTER TABLE boards ADD COLUMN starred INTEGER NOT NULL DEFAULT 0`);
  }

  if (!hasArchivedAt) {
    db.run(`ALTER TABLE boards ADD COLUMN archived_at TEXT`);
  }

  if (!hasOwnerPubkey) {
    db.run(`ALTER TABLE boards ADD COLUMN owner_pubkey TEXT NULL`);
  }

  if (!hasOwnerNpub) {
    db.run(`ALTER TABLE boards ADD COLUMN owner_npub TEXT NULL`);
  }
}

ensureBoardsSchema();

function ensureBoardElementsSchema() {
  const info = db.query<{ name: string; type: string }>(`PRAGMA table_info('board_elements')`).all();
  const idColumn = info.find((column) => column.name === "id");
  if (!idColumn) {
    createBoardElementsTable();
    return;
  }
  if (idColumn.type?.toUpperCase() === "TEXT") return;

  db.run(`ALTER TABLE board_elements RENAME TO board_elements_legacy`);
  createBoardElementsTable();
  const legacyRows = db
    .query<{
      id: number;
      board_id: number;
      type: string;
      props_json: string;
      created_at: string;
      updated_at: string;
    }>(`SELECT id, board_id, type, props_json, created_at, updated_at FROM board_elements_legacy`)
    .all();
  const insertStmt = db.query(
    `INSERT OR REPLACE INTO board_elements (id, board_id, type, props_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  for (const row of legacyRows) {
    let elementId: string | null = null;
    try {
      const parsed = JSON.parse(row.props_json) as { id?: unknown };
      if (typeof parsed?.id === "string" && parsed.id.trim()) {
        elementId = parsed.id;
      }
    } catch (_error) {
      // ignore malformed legacy data
    }
    if (!elementId) elementId = String(row.id);
    insertStmt.run(elementId, row.board_id, row.type, row.props_json, row.created_at, row.updated_at);
  }
  db.run(`DROP TABLE board_elements_legacy`);
}

function createBoardElementsTable() {
  db.run(`
    CREATE TABLE IF NOT EXISTS board_elements (
      id TEXT PRIMARY KEY,
      board_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      props_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(board_id) REFERENCES boards(id) ON DELETE CASCADE
    )
  `);
}

ensureBoardElementsSchema();

db.run(`
  CREATE TABLE IF NOT EXISTS board_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    element_id INTEGER NOT NULL,
    author TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(element_id) REFERENCES board_elements(id) ON DELETE CASCADE
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    board_id INTEGER NOT NULL,
    owner_pubkey TEXT NULL,
    original_filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    storage_path TEXT NOT NULL,
    public_url TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(board_id) REFERENCES boards(id) ON DELETE CASCADE
  )
`);

const listByOwnerStmt = db.query<Todo>(
  "SELECT * FROM todos WHERE deleted = 0 AND owner = ? ORDER BY created_at DESC"
);
const listScheduledStmt = db.query<Todo>(
  `SELECT * FROM todos
   WHERE deleted = 0
     AND owner = ?
     AND scheduled_for IS NOT NULL
     AND scheduled_for != ''
     AND date(scheduled_for) <= date(?)
   ORDER BY scheduled_for ASC, created_at DESC`
);
const listUnscheduledStmt = db.query<Todo>(
  `SELECT * FROM todos
   WHERE deleted = 0
     AND owner = ?
     AND (scheduled_for IS NULL OR scheduled_for = '')
   ORDER BY created_at DESC`
);
const insertStmt = db.query(
  "INSERT INTO todos (title, description, priority, state, done, owner, tags) VALUES (?, '', 'sand', 'new', 0, ?, ?) RETURNING *"
);
const insertFullStmt = db.query<Todo>(
  `INSERT INTO todos (title, description, priority, state, done, owner, scheduled_for, tags)
   VALUES (?, ?, ?, ?, CASE WHEN ? = 'done' THEN 1 ELSE 0 END, ?, ?, ?)
   RETURNING *`
);
const deleteStmt = db.query("UPDATE todos SET deleted = 1 WHERE id = ? AND owner = ?");
const updateStmt = db.query<Todo>(
  `UPDATE todos
   SET
    title = ?,
    description = ?,
    priority = ?,
    state = ?,
    done = CASE WHEN ? = 'done' THEN 1 ELSE 0 END,
    scheduled_for = ?,
    tags = ?
   WHERE id = ? AND owner = ?
   RETURNING *`
);
const transitionStmt = db.query<Todo>(
  `UPDATE todos
   SET
    state = ?,
    done = CASE WHEN ? = 'done' THEN 1 ELSE 0 END
   WHERE id = ? AND owner = ?
   RETURNING *`
);
const upsertSummaryStmt = db.query<Summary>(
  `INSERT INTO ai_summaries (owner, summary_date, day_ahead, week_ahead, suggestions)
   VALUES (?, ?, ?, ?, ?)
   ON CONFLICT(owner, summary_date) DO UPDATE SET
     day_ahead = excluded.day_ahead,
     week_ahead = excluded.week_ahead,
     suggestions = excluded.suggestions,
     updated_at = CURRENT_TIMESTAMP
   RETURNING *`
);
const latestDaySummaryStmt = db.query<Summary>(
  `SELECT * FROM ai_summaries
   WHERE owner = ? AND summary_date = ?
   ORDER BY updated_at DESC
   LIMIT 1`
);
const latestWeekSummaryStmt = db.query<Summary>(
  `SELECT * FROM ai_summaries
   WHERE owner = ? AND summary_date BETWEEN ? AND ?
   ORDER BY updated_at DESC
   LIMIT 1`
);
const insertAttachmentStmt = db.query<Attachment>(
  `INSERT INTO attachments
   (id, board_id, owner_pubkey, original_filename, mime_type, size, storage_path, public_url)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)
   RETURNING *`
);
const insertBoardStmt = db.query<Board>(
  `INSERT INTO boards (title, updated_at, owner_pubkey, owner_npub)
   VALUES (?, CURRENT_TIMESTAMP, ?, ?)
   RETURNING *`
);
const getBoardStmt = db.query<Board>(`SELECT * FROM boards WHERE id = ?`);
const listBoardsStmt = db.query<Board>(
  `SELECT * FROM boards
   WHERE (? = 1 OR archived_at IS NULL)
   ORDER BY starred DESC,
            last_accessed_at IS NULL,
            last_accessed_at DESC,
            updated_at DESC`
);
const updateBoardStarredStmt = db.query<Board>(
  `UPDATE boards
   SET starred = ?, updated_at = CURRENT_TIMESTAMP
   WHERE id = ?
   RETURNING *`
);
const archiveBoardStmt = db.query<Board>(
  `UPDATE boards
   SET archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
   WHERE id = ?
   RETURNING *`
);
const unarchiveBoardStmt = db.query<Board>(
  `UPDATE boards
   SET archived_at = NULL, updated_at = CURRENT_TIMESTAMP
   WHERE id = ?
   RETURNING *`
);
const insertBoardCopyStmt = db.query<Board>(
  `INSERT INTO boards (title, updated_at, last_accessed_at, starred, archived_at, owner_pubkey, owner_npub)
   VALUES (?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, NULL, ?, ?)
   RETURNING *`
);
const updateBoardTitleStmt = db.query<Board>(
  `UPDATE boards
   SET title = ?, updated_at = CURRENT_TIMESTAMP
   WHERE id = ?
   RETURNING *`
);
const touchBoardUpdatedAtStmt = db.query<Board>(
  `UPDATE boards
   SET updated_at = CURRENT_TIMESTAMP
   WHERE id = ?
   RETURNING *`
);
const touchBoardLastAccessedAtStmt = db.query<Board>(
  `UPDATE boards
   SET last_accessed_at = CURRENT_TIMESTAMP
   WHERE id = ?
   RETURNING *`
);
const listBoardElementsStmt = db.query<BoardElement>(
  `SELECT * FROM board_elements
   WHERE board_id = ?
   ORDER BY created_at ASC`
);
const upsertBoardElementStmt = db.query<BoardElement>(
  `INSERT INTO board_elements (id, board_id, type, props_json)
   VALUES (?, ?, ?, ?)
   ON CONFLICT(id) DO UPDATE SET
     board_id = excluded.board_id,
     type = excluded.type,
     props_json = excluded.props_json,
     updated_at = CURRENT_TIMESTAMP
   RETURNING *`
);
const getBoardElementStmt = db.query<BoardElement>(
  `SELECT * FROM board_elements WHERE id = ? AND board_id = ?`
);
const updateBoardElementStmt = db.query<BoardElement>(
  `UPDATE board_elements
   SET props_json = ?, updated_at = CURRENT_TIMESTAMP
   WHERE id = ? AND board_id = ?
   RETURNING *`
);
const deleteBoardElementStmt = db.query(`DELETE FROM board_elements WHERE id = ? AND board_id = ?`);

export function listTodos(owner: string | null, filterTags?: string[]) {
  if (!owner) return [];
  const todos = listByOwnerStmt.all(owner);
  if (!filterTags || filterTags.length === 0) return todos;
  // Filter todos that have at least one of the specified tags
  return todos.filter((todo) => {
    const todoTags = todo.tags ? todo.tags.split(",").map((t) => t.trim().toLowerCase()) : [];
    return filterTags.some((ft) => todoTags.includes(ft.toLowerCase()));
  });
}

export function listScheduledTodos(owner: string, endDate: string) {
  return listScheduledStmt.all(owner, endDate);
}

export function listUnscheduledTodos(owner: string) {
  return listUnscheduledStmt.all(owner);
}

export function addTodo(title: string, owner: string, tags: string = "") {
  if (!title.trim()) return null;
  const todo = insertStmt.get(title.trim(), owner, tags) as Todo | undefined;
  return todo ?? null;
}

export function addTodoFull(
  owner: string,
  fields: {
    title: string;
    description?: string;
    priority?: TodoPriority;
    state?: TodoState;
    scheduled_for?: string | null;
    tags?: string;
  }
) {
  const title = fields.title?.trim();
  if (!title) return null;
  const description = fields.description?.trim() ?? "";
  const priority = fields.priority ?? "sand";
  const state = fields.state ?? "new";
  const scheduled_for = fields.scheduled_for ?? null;
  const tags = fields.tags?.trim() ?? "";
  const todo = insertFullStmt.get(
    title,
    description,
    priority,
    state,
    state,
    owner,
    scheduled_for,
    tags
  ) as Todo | undefined;
  return todo ?? null;
}

export function deleteTodo(id: number, owner: string) {
  deleteStmt.run(id, owner);
}

export function updateTodo(
  id: number,
  owner: string,
  fields: {
    title: string;
    description: string;
    priority: TodoPriority;
    state: TodoState;
    scheduled_for: string | null;
    tags: string;
  }
) {
  const todo = updateStmt.get(
    fields.title,
    fields.description,
    fields.priority,
    fields.state,
    fields.state,
    fields.scheduled_for,
    fields.tags,
    id,
    owner
  ) as Todo | undefined;
  return todo ?? null;
}

export function transitionTodo(id: number, owner: string, state: TodoState) {
  const todo = transitionStmt.get(state, state, id, owner) as Todo | undefined;
  return todo ?? null;
}

export function assignAllTodosToOwner(npub: string) {
  if (!npub) return;
  db.run("UPDATE todos SET owner = ? WHERE owner = '' OR owner IS NULL", npub);
}

export function upsertSummary({
  owner,
  summaryDate,
  dayAhead,
  weekAhead,
  suggestions,
}: {
  owner: string;
  summaryDate: string;
  dayAhead: string | null;
  weekAhead: string | null;
  suggestions: string | null;
}) {
  const summary = upsertSummaryStmt.get(owner, summaryDate, dayAhead, weekAhead, suggestions) as Summary | undefined;
  return summary ?? null;
}

export function getLatestSummaries(owner: string, today: string, weekStart: string, weekEnd: string) {
  const day = latestDaySummaryStmt.get(owner, today) as Summary | undefined;
  const week = latestWeekSummaryStmt.get(owner, weekStart, weekEnd) as Summary | undefined;
  return { day: day ?? null, week: week ?? null };
}

export function createBoard(title: string, owner: { pubkey: string; npub: string } | null) {
  return insertBoardStmt.get(title, owner?.pubkey ?? null, owner?.npub ?? null) ?? null;
}

export function getBoardById(id: number) {
  return getBoardStmt.get(id) ?? null;
}

export function listBoards(includeArchived: boolean) {
  return listBoardsStmt.all(includeArchived ? 1 : 0);
}

export function updateBoardTitle(id: number, title: string) {
  return updateBoardTitleStmt.get(title, id) ?? null;
}

export function updateBoardStarred(id: number, starred: number) {
  return updateBoardStarredStmt.get(starred, id) ?? null;
}

export function archiveBoard(id: number) {
  return archiveBoardStmt.get(id) ?? null;
}

export function unarchiveBoard(id: number) {
  return unarchiveBoardStmt.get(id) ?? null;
}

export function createBoardCopy(title: string, owner: { pubkey: string; npub: string } | null) {
  return insertBoardCopyStmt.get(title, owner?.pubkey ?? null, owner?.npub ?? null) ?? null;
}

export function touchBoardUpdatedAt(id: number) {
  return touchBoardUpdatedAtStmt.get(id) ?? null;
}

export function touchBoardLastAccessedAt(id: number) {
  return touchBoardLastAccessedAtStmt.get(id) ?? null;
}

export function listBoardElements(boardId: number) {
  return listBoardElementsStmt.all(boardId);
}

export function insertOrUpdateBoardElement(boardId: number, elementId: string, type: string, propsJson: string) {
  return upsertBoardElementStmt.get(elementId, boardId, type, propsJson) ?? null;
}

export function getBoardElement(boardId: number, elementId: string) {
  return getBoardElementStmt.get(elementId, boardId) ?? null;
}

export function updateBoardElement(boardId: number, elementId: string, propsJson: string) {
  return updateBoardElementStmt.get(propsJson, elementId, boardId) ?? null;
}

export function deleteBoardElements(boardId: number, ids: string[]) {
  let removed = 0;
  for (const id of ids) {
    if (!id) continue;
    const existing = getBoardElementStmt.get(id, boardId) as BoardElement | undefined;
    if (!existing) continue;
    deleteBoardElementStmt.run(id, boardId);
    removed += 1;
  }
  return removed;
}

export function createAttachment(record: {
  id: string;
  boardId: number;
  ownerPubkey: string | null;
  originalFilename: string;
  mimeType: string;
  size: number;
  storagePath: string;
  publicUrl: string;
}) {
  return (
    insertAttachmentStmt.get(
      record.id,
      record.boardId,
      record.ownerPubkey,
      record.originalFilename,
      record.mimeType,
      record.size,
      record.storagePath,
      record.publicUrl
    ) ?? null
  );
}

export function resetDatabase() {
  db.run("DELETE FROM todos");
  db.run("DELETE FROM ai_summaries");
  db.run("DELETE FROM sqlite_sequence WHERE name IN ('todos', 'ai_summaries')");
}
