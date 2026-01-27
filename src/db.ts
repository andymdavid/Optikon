import { Database, type SQLQueryBindings } from "bun:sqlite";

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
  description: string | null;
  created_at: string;
  updated_at: string;
  last_accessed_at: string | null;
  starred: number;
  archived_at: string | null;
  owner_pubkey: string | null;
  owner_npub: string | null;
  default_role: string;
  is_private: number;
  workspace_id: number | null;
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

export type BoardMember = {
  board_id: number;
  pubkey: string;
  role: string;
  created_at: string;
};

export type Workspace = {
  id: number;
  title: string;
  owner_pubkey: string | null;
  owner_npub: string | null;
  is_personal: number;
  created_at: string;
  updated_at: string;
};

export type WorkspaceMember = {
  workspace_id: number;
  pubkey: string;
  role: string;
  created_at: string;
};

export type SessionRecord = {
  token: string;
  pubkey: string;
  npub: string;
  method: string;
  created_at: number;
  expires_at: number;
};

const db = new Database(Bun.env.DB_PATH || "do-the-other-stuff.sqlite");
db.run("PRAGMA foreign_keys = ON");

type Migration = {
  version: number;
  up: (database: Database) => void;
};

const addColumn = (database: Database, sql: string) => {
  try {
    database.run(sql);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("duplicate column")) {
      throw error;
    }
  }
};

function ensureBoardsSchema(database: Database) {
  const info = database.query<{ name: string }, SQLQueryBindings[]>(`PRAGMA table_info('boards')`).all();
  const hasUpdatedAt = info.some((column) => column.name === "updated_at");
  const hasLastAccessedAt = info.some((column) => column.name === "last_accessed_at");
  const hasStarred = info.some((column) => column.name === "starred");
  const hasArchivedAt = info.some((column) => column.name === "archived_at");
  const hasOwnerPubkey = info.some((column) => column.name === "owner_pubkey");
  const hasOwnerNpub = info.some((column) => column.name === "owner_npub");
  const hasDefaultRole = info.some((column) => column.name === "default_role");
  const hasDescription = info.some((column) => column.name === "description");
  const hasIsPrivate = info.some((column) => column.name === "is_private");

  if (!hasUpdatedAt) {
    database.run(`ALTER TABLE boards ADD COLUMN updated_at TEXT`);
    database.run(`UPDATE boards SET updated_at = created_at WHERE updated_at IS NULL`);
  }

  if (!hasLastAccessedAt) {
    database.run(`ALTER TABLE boards ADD COLUMN last_accessed_at TEXT`);
  }

  if (!hasStarred) {
    database.run(`ALTER TABLE boards ADD COLUMN starred INTEGER NOT NULL DEFAULT 0`);
  }

  if (!hasArchivedAt) {
    database.run(`ALTER TABLE boards ADD COLUMN archived_at TEXT`);
  }

  if (!hasOwnerPubkey) {
    database.run(`ALTER TABLE boards ADD COLUMN owner_pubkey TEXT NULL`);
  }

  if (!hasOwnerNpub) {
    database.run(`ALTER TABLE boards ADD COLUMN owner_npub TEXT NULL`);
  }

  if (!hasDefaultRole) {
    database.run(`ALTER TABLE boards ADD COLUMN default_role TEXT NOT NULL DEFAULT 'editor'`);
    database.run(`UPDATE boards SET default_role = 'editor' WHERE default_role IS NULL OR default_role = ''`);
  }

  if (!hasDescription) {
    database.run(`ALTER TABLE boards ADD COLUMN description TEXT NULL`);
  }

  if (!hasIsPrivate) {
    database.run(`ALTER TABLE boards ADD COLUMN is_private INTEGER NOT NULL DEFAULT 0`);
    database.run(`UPDATE boards SET is_private = 0 WHERE is_private IS NULL`);
  }
}

function ensureBoardsWorkspaceSchema(database: Database) {
  const info = database.query<{ name: string }, SQLQueryBindings[]>(`PRAGMA table_info('boards')`).all();
  const hasWorkspaceId = info.some((column) => column.name === "workspace_id");
  if (!hasWorkspaceId) {
    database.run(`ALTER TABLE boards ADD COLUMN workspace_id INTEGER NULL`);
  }
  database.run(`CREATE INDEX IF NOT EXISTS idx_boards_workspace_id ON boards(workspace_id)`);
}

function ensureBoardElementsSchema(database: Database) {
  const info = database.query<{ name: string; type: string }, SQLQueryBindings[]>(
    `PRAGMA table_info('board_elements')`
  ).all();
  const idColumn = info.find((column) => column.name === "id");
  if (!idColumn) {
    createBoardElementsTable(database);
    return;
  }
  if (idColumn.type?.toUpperCase() === "TEXT") return;

  database.run(`ALTER TABLE board_elements RENAME TO board_elements_legacy`);
  createBoardElementsTable(database);
  const legacyRows = database
    .query<{
      id: number;
      board_id: number;
      type: string;
      props_json: string;
      created_at: string;
      updated_at: string;
    }, SQLQueryBindings[]>(`SELECT id, board_id, type, props_json, created_at, updated_at FROM board_elements_legacy`)
    .all();
  const insertStmt = database.query<unknown, SQLQueryBindings[]>(
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
  database.run(`DROP TABLE board_elements_legacy`);
}

function createBoardElementsTable(database: Database) {
  database.run(`
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

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    up: (database) => {
      database.run(`
        CREATE TABLE IF NOT EXISTS todos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          done INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
    },
  },
  {
    version: 2,
    up: (database) => {
      addColumn(database, "ALTER TABLE todos ADD COLUMN description TEXT DEFAULT ''");
      addColumn(database, "ALTER TABLE todos ADD COLUMN priority TEXT NOT NULL DEFAULT 'sand'");
      addColumn(database, "ALTER TABLE todos ADD COLUMN state TEXT NOT NULL DEFAULT 'new'");
      addColumn(database, "ALTER TABLE todos ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0");
      addColumn(database, "ALTER TABLE todos ADD COLUMN owner TEXT NOT NULL DEFAULT ''");
      addColumn(database, "ALTER TABLE todos ADD COLUMN scheduled_for TEXT DEFAULT NULL");
      addColumn(database, "ALTER TABLE todos ADD COLUMN tags TEXT DEFAULT ''");
    },
  },
  {
    version: 3,
    up: (database) => {
      database.run(`
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
    },
  },
  {
    version: 4,
    up: (database) => {
      database.run(`
        CREATE TABLE IF NOT EXISTS boards (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          description TEXT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          last_accessed_at TEXT,
          starred INTEGER NOT NULL DEFAULT 0,
          archived_at TEXT,
          owner_pubkey TEXT NULL,
          owner_npub TEXT NULL,
          default_role TEXT NOT NULL DEFAULT 'editor',
          is_private INTEGER NOT NULL DEFAULT 0
        )
      `);
    },
  },
  {
    version: 5,
    up: (database) => {
      ensureBoardsSchema(database);
    },
  },
  {
    version: 6,
    up: (database) => {
      database.run(`
        CREATE TABLE IF NOT EXISTS board_renouncements (
          board_id INTEGER NOT NULL,
          pubkey TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (board_id, pubkey),
          FOREIGN KEY(board_id) REFERENCES boards(id) ON DELETE CASCADE
        )
      `);
    },
  },
  {
    version: 7,
    up: (database) => {
      ensureBoardElementsSchema(database);
    },
  },
  {
    version: 8,
    up: (database) => {
      database.run(`
        CREATE TABLE IF NOT EXISTS board_comments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          element_id INTEGER NOT NULL,
          author TEXT NOT NULL,
          text TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(element_id) REFERENCES board_elements(id) ON DELETE CASCADE
        )
      `);
    },
  },
  {
    version: 9,
    up: (database) => {
      database.run(`
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
    },
  },
  {
    version: 10,
    up: (database) => {
      database.run(`
        CREATE TABLE IF NOT EXISTS sessions (
          token TEXT PRIMARY KEY,
          pubkey TEXT NOT NULL,
          npub TEXT NOT NULL,
          method TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL
        )
      `);
    },
  },
  {
    version: 11,
    up: (database) => {
      database.run(`
        CREATE TABLE IF NOT EXISTS board_members (
          board_id INTEGER NOT NULL,
          pubkey TEXT NOT NULL,
          role TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (board_id, pubkey),
          FOREIGN KEY(board_id) REFERENCES boards(id) ON DELETE CASCADE
        )
      `);
    },
  },
  {
    version: 12,
    up: (database) => {
      database.run(`
        CREATE TABLE IF NOT EXISTS workspaces (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          owner_pubkey TEXT NULL,
          owner_npub TEXT NULL,
          is_personal INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      database.run(`CREATE INDEX IF NOT EXISTS idx_workspaces_owner_pubkey ON workspaces(owner_pubkey)`);
      database.run(`
        CREATE TABLE IF NOT EXISTS workspace_members (
          workspace_id INTEGER NOT NULL,
          pubkey TEXT NOT NULL,
          role TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (workspace_id, pubkey),
          FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        )
      `);
      ensureBoardsWorkspaceSchema(database);

      const ownerRows = database
        .query<{ owner_pubkey: string; owner_npub: string | null }, SQLQueryBindings[]>(
          `SELECT DISTINCT owner_pubkey, owner_npub
           FROM boards
           WHERE owner_pubkey IS NOT NULL AND owner_pubkey != ''`
        )
        .all();

      const insertWorkspace = database.query<Workspace, SQLQueryBindings[]>(
        `INSERT INTO workspaces (title, owner_pubkey, owner_npub, is_personal)
         VALUES (?, ?, ?, ?)
         RETURNING *`
      );
      const findPersonalWorkspace = database.query<Workspace, SQLQueryBindings[]>(
        `SELECT * FROM workspaces
         WHERE owner_pubkey = ? AND is_personal = 1
         ORDER BY id ASC
         LIMIT 1`
      );
      const upsertWorkspaceMember = database.query<unknown, SQLQueryBindings[]>(
        `INSERT INTO workspace_members (workspace_id, pubkey, role)
         VALUES (?, ?, ?)
         ON CONFLICT(workspace_id, pubkey) DO UPDATE SET
           role = excluded.role`
      );
      const updateBoardsWorkspace = database.query<unknown, SQLQueryBindings[]>(
        `UPDATE boards
         SET workspace_id = ?
         WHERE owner_pubkey = ? AND (workspace_id IS NULL OR workspace_id = 0)`
      );

      for (const row of ownerRows) {
        const existing = findPersonalWorkspace.get(row.owner_pubkey) ?? null;
        const workspace =
          existing ??
          insertWorkspace.get("Personal", row.owner_pubkey, row.owner_npub ?? null, 1) ??
          null;
        if (!workspace) continue;
        upsertWorkspaceMember.run(workspace.id, row.owner_pubkey, "owner");
        updateBoardsWorkspace.run(workspace.id, row.owner_pubkey);
      }

      const recoveryWorkspace =
        database
          .query<Workspace, SQLQueryBindings[]>(
            `SELECT * FROM workspaces
             WHERE owner_pubkey IS NULL AND is_personal = 0
             ORDER BY id ASC
             LIMIT 1`
          )
          .get() ??
        insertWorkspace.get("Recovery", null, null, 0);
      if (recoveryWorkspace) {
        database.run(
          `UPDATE boards
           SET workspace_id = ?
           WHERE workspace_id IS NULL OR workspace_id = 0`,
          [recoveryWorkspace.id]
        );
      }
    },
  },
];

function getSchemaVersion(database: Database) {
  try {
    const row = database
      .query<{ version: number }, SQLQueryBindings[]>(`SELECT version FROM schema_version LIMIT 1`)
      .get();
    return row?.version ?? 0;
  } catch (_error) {
    return 0;
  }
}

function setSchemaVersion(database: Database, version: number) {
  database.run(`CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)`);
  database.run(`DELETE FROM schema_version`);
  database.run(`INSERT INTO schema_version (version) VALUES (?)`, [version]);
}

function runMigrations(database: Database) {
  const currentVersion = getSchemaVersion(database);
  for (const migration of MIGRATIONS) {
    if (migration.version <= currentVersion) continue;
    migration.up(database);
    setSchemaVersion(database, migration.version);
  }
}

runMigrations(db);

const listByOwnerStmt = db.query<Todo, SQLQueryBindings[]>(
  "SELECT * FROM todos WHERE deleted = 0 AND owner = ? ORDER BY created_at DESC"
);
const listScheduledStmt = db.query<Todo, SQLQueryBindings[]>(
  `SELECT * FROM todos
   WHERE deleted = 0
     AND owner = ?
     AND scheduled_for IS NOT NULL
     AND scheduled_for != ''
     AND date(scheduled_for) <= date(?)
   ORDER BY scheduled_for ASC, created_at DESC`
);
const listUnscheduledStmt = db.query<Todo, SQLQueryBindings[]>(
  `SELECT * FROM todos
   WHERE deleted = 0
     AND owner = ?
     AND (scheduled_for IS NULL OR scheduled_for = '')
   ORDER BY created_at DESC`
);
const insertStmt = db.query<Todo, SQLQueryBindings[]>(
  "INSERT INTO todos (title, description, priority, state, done, owner, tags) VALUES (?, '', 'sand', 'new', 0, ?, ?) RETURNING *"
);
const insertFullStmt = db.query<Todo, SQLQueryBindings[]>(
  `INSERT INTO todos (title, description, priority, state, done, owner, scheduled_for, tags)
   VALUES (?, ?, ?, ?, CASE WHEN ? = 'done' THEN 1 ELSE 0 END, ?, ?, ?)
   RETURNING *`
);
const deleteStmt = db.query<unknown, SQLQueryBindings[]>(
  "UPDATE todos SET deleted = 1 WHERE id = ? AND owner = ?"
);
const updateStmt = db.query<Todo, SQLQueryBindings[]>(
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
const transitionStmt = db.query<Todo, SQLQueryBindings[]>(
  `UPDATE todos
   SET
    state = ?,
    done = CASE WHEN ? = 'done' THEN 1 ELSE 0 END
   WHERE id = ? AND owner = ?
   RETURNING *`
);
const upsertSummaryStmt = db.query<Summary, SQLQueryBindings[]>(
  `INSERT INTO ai_summaries (owner, summary_date, day_ahead, week_ahead, suggestions)
   VALUES (?, ?, ?, ?, ?)
   ON CONFLICT(owner, summary_date) DO UPDATE SET
     day_ahead = excluded.day_ahead,
     week_ahead = excluded.week_ahead,
     suggestions = excluded.suggestions,
     updated_at = CURRENT_TIMESTAMP
   RETURNING *`
);
const latestDaySummaryStmt = db.query<Summary, SQLQueryBindings[]>(
  `SELECT * FROM ai_summaries
   WHERE owner = ? AND summary_date = ?
   ORDER BY updated_at DESC
   LIMIT 1`
);
const latestWeekSummaryStmt = db.query<Summary, SQLQueryBindings[]>(
  `SELECT * FROM ai_summaries
   WHERE owner = ? AND summary_date BETWEEN ? AND ?
   ORDER BY updated_at DESC
   LIMIT 1`
);
const insertAttachmentStmt = db.query<Attachment, SQLQueryBindings[]>(
  `INSERT INTO attachments
   (id, board_id, owner_pubkey, original_filename, mime_type, size, storage_path, public_url)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)
   RETURNING *`
);
const listBoardAttachmentsStmt = db.query<Attachment, SQLQueryBindings[]>(
  `SELECT * FROM attachments WHERE board_id = ? ORDER BY created_at ASC`
);
const getAttachmentStmt = db.query<Attachment, SQLQueryBindings[]>(
  `SELECT * FROM attachments WHERE id = ? AND board_id = ? LIMIT 1`
);
const insertBoardStmt = db.query<Board, SQLQueryBindings[]>(
  `INSERT INTO boards (title, description, updated_at, owner_pubkey, owner_npub, default_role, is_private, workspace_id)
   VALUES (?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)
   RETURNING *`
);
const getBoardStmt = db.query<Board, SQLQueryBindings[]>(`SELECT * FROM boards WHERE id = ?`);
const listBoardsStmt = db.query<Board, SQLQueryBindings[]>(
  `SELECT * FROM boards
   WHERE (? = 1 OR archived_at IS NULL)
   ORDER BY starred DESC,
            last_accessed_at IS NULL,
            last_accessed_at DESC,
            updated_at DESC`
);
const insertBoardRenouncementStmt = db.query<unknown, SQLQueryBindings[]>(
  `INSERT OR IGNORE INTO board_renouncements (board_id, pubkey)
   VALUES (?, ?)`
);
const listBoardRenouncementsStmt = db.query<{ board_id: number }, SQLQueryBindings[]>(
  `SELECT board_id FROM board_renouncements WHERE pubkey = ?`
);
const isBoardRenouncedStmt = db.query<{ board_id: number }, SQLQueryBindings[]>(
  `SELECT board_id FROM board_renouncements WHERE board_id = ? AND pubkey = ? LIMIT 1`
);
const updateBoardStarredStmt = db.query<Board, SQLQueryBindings[]>(
  `UPDATE boards
   SET starred = ?, updated_at = CURRENT_TIMESTAMP
   WHERE id = ?
   RETURNING *`
);
const updateBoardDefaultRoleStmt = db.query<Board, SQLQueryBindings[]>(
  `UPDATE boards
   SET default_role = ?, updated_at = CURRENT_TIMESTAMP
   WHERE id = ?
   RETURNING *`
);
const updateBoardPrivacyStmt = db.query<Board, SQLQueryBindings[]>(
  `UPDATE boards
   SET is_private = ?, updated_at = CURRENT_TIMESTAMP
   WHERE id = ?
   RETURNING *`
);
const deleteBoardStmt = db.query<Board, SQLQueryBindings[]>(`DELETE FROM boards WHERE id = ? RETURNING *`);
const archiveBoardStmt = db.query<Board, SQLQueryBindings[]>(
  `UPDATE boards
   SET archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
   WHERE id = ?
   RETURNING *`
);
const unarchiveBoardStmt = db.query<Board, SQLQueryBindings[]>(
  `UPDATE boards
   SET archived_at = NULL, updated_at = CURRENT_TIMESTAMP
   WHERE id = ?
   RETURNING *`
);
const insertBoardCopyStmt = db.query<Board, SQLQueryBindings[]>(
  `INSERT INTO boards (title, description, updated_at, last_accessed_at, starred, archived_at, owner_pubkey, owner_npub, default_role, is_private, workspace_id)
   VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0, NULL, ?, ?, ?, ?, ?)
   RETURNING *`
);
const updateBoardTitleStmt = db.query<Board, SQLQueryBindings[]>(
  `UPDATE boards
   SET title = ?, updated_at = CURRENT_TIMESTAMP
   WHERE id = ?
   RETURNING *`
);
const updateBoardDescriptionStmt = db.query<Board, SQLQueryBindings[]>(
  `UPDATE boards
   SET description = ?, updated_at = CURRENT_TIMESTAMP
   WHERE id = ?
   RETURNING *`
);
const touchBoardUpdatedAtStmt = db.query<Board, SQLQueryBindings[]>(
  `UPDATE boards
   SET updated_at = CURRENT_TIMESTAMP
   WHERE id = ?
   RETURNING *`
);
const touchBoardLastAccessedAtStmt = db.query<Board, SQLQueryBindings[]>(
  `UPDATE boards
   SET last_accessed_at = CURRENT_TIMESTAMP
   WHERE id = ?
   RETURNING *`
);
const listBoardElementsStmt = db.query<BoardElement, SQLQueryBindings[]>(
  `SELECT * FROM board_elements
   WHERE board_id = ?
   ORDER BY created_at ASC`
);
const upsertBoardElementStmt = db.query<BoardElement, SQLQueryBindings[]>(
  `INSERT INTO board_elements (id, board_id, type, props_json)
   VALUES (?, ?, ?, ?)
   ON CONFLICT(id) DO UPDATE SET
     board_id = excluded.board_id,
     type = excluded.type,
     props_json = excluded.props_json,
     updated_at = CURRENT_TIMESTAMP
   RETURNING *`
);
const getBoardElementStmt = db.query<BoardElement, SQLQueryBindings[]>(
  `SELECT * FROM board_elements WHERE id = ? AND board_id = ?`
);
const updateBoardElementStmt = db.query<BoardElement, SQLQueryBindings[]>(
  `UPDATE board_elements
   SET props_json = ?, updated_at = CURRENT_TIMESTAMP
   WHERE id = ? AND board_id = ?
   RETURNING *`
);
const deleteBoardElementStmt = db.query<unknown, SQLQueryBindings[]>(
  `DELETE FROM board_elements WHERE id = ? AND board_id = ?`
);
const insertSessionStmt = db.query<SessionRecord, SQLQueryBindings[]>(
  `INSERT INTO sessions (token, pubkey, npub, method, created_at, expires_at)
   VALUES (?, ?, ?, ?, ?, ?)
   RETURNING *`
);
const getSessionStmt = db.query<SessionRecord, SQLQueryBindings[]>(
  `SELECT * FROM sessions WHERE token = ? LIMIT 1`
);
const deleteSessionStmt = db.query<unknown, SQLQueryBindings[]>(
  `DELETE FROM sessions WHERE token = ?`
);
const deleteExpiredSessionsStmt = db.query<unknown, SQLQueryBindings[]>(
  `DELETE FROM sessions WHERE expires_at <= ?`
);
const deleteBoardAttachmentsStmt = db.query<unknown, SQLQueryBindings[]>(
  `DELETE FROM attachments WHERE board_id = ?`
);
const upsertBoardMemberStmt = db.query<BoardMember, SQLQueryBindings[]>(
  `INSERT INTO board_members (board_id, pubkey, role)
   VALUES (?, ?, ?)
   ON CONFLICT(board_id, pubkey) DO UPDATE SET
     role = excluded.role
   RETURNING *`
);
const listBoardMembersStmt = db.query<BoardMember, SQLQueryBindings[]>(
  `SELECT * FROM board_members WHERE board_id = ? ORDER BY created_at ASC`
);
const getBoardMemberStmt = db.query<BoardMember, SQLQueryBindings[]>(
  `SELECT * FROM board_members WHERE board_id = ? AND pubkey = ? LIMIT 1`
);
const deleteBoardMemberStmt = db.query<unknown, SQLQueryBindings[]>(
  `DELETE FROM board_members WHERE board_id = ? AND pubkey = ?`
);
const insertWorkspaceStmt = db.query<Workspace, SQLQueryBindings[]>(
  `INSERT INTO workspaces (title, owner_pubkey, owner_npub, is_personal)
   VALUES (?, ?, ?, ?)
   RETURNING *`
);
const findPersonalWorkspaceStmt = db.query<Workspace, SQLQueryBindings[]>(
  `SELECT * FROM workspaces
   WHERE owner_pubkey = ? AND is_personal = 1
   ORDER BY id ASC
   LIMIT 1`
);
const getWorkspaceStmt = db.query<Workspace, SQLQueryBindings[]>(
  `SELECT * FROM workspaces WHERE id = ? LIMIT 1`
);
const listWorkspacesForMemberStmt = db.query<Workspace, SQLQueryBindings[]>(
  `SELECT w.*
   FROM workspaces w
   INNER JOIN workspace_members wm ON wm.workspace_id = w.id
   WHERE wm.pubkey = ?
   ORDER BY w.is_personal DESC, w.updated_at DESC, w.created_at DESC`
);
const upsertWorkspaceMemberStmt = db.query<WorkspaceMember, SQLQueryBindings[]>(
  `INSERT INTO workspace_members (workspace_id, pubkey, role)
   VALUES (?, ?, ?)
   ON CONFLICT(workspace_id, pubkey) DO UPDATE SET
     role = excluded.role
   RETURNING *`
);
const listWorkspaceMembersStmt = db.query<WorkspaceMember, SQLQueryBindings[]>(
  `SELECT * FROM workspace_members WHERE workspace_id = ? ORDER BY created_at ASC`
);
const getWorkspaceMemberStmt = db.query<WorkspaceMember, SQLQueryBindings[]>(
  `SELECT * FROM workspace_members WHERE workspace_id = ? AND pubkey = ? LIMIT 1`
);
const updateBoardsWorkspaceByOwnerStmt = db.query<unknown, SQLQueryBindings[]>(
  `UPDATE boards
   SET workspace_id = ?
   WHERE owner_pubkey = ? AND (workspace_id IS NULL OR workspace_id = 0)`
);
const recoveryWorkspaceStmt = db.query<Workspace, SQLQueryBindings[]>(
  `SELECT * FROM workspaces
   WHERE owner_pubkey IS NULL AND is_personal = 0
   ORDER BY id ASC
   LIMIT 1`
);

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
  db.run("UPDATE todos SET owner = ? WHERE owner = '' OR owner IS NULL", [npub]);
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

export function createBoard(
  title: string,
  description: string | null,
  owner: { pubkey: string; npub: string } | null,
  defaultRole: string = "editor",
  isPrivate: number = 0,
  workspaceId: number | null = null
) {
  return (
    insertBoardStmt.get(
      title,
      description ?? null,
      owner?.pubkey ?? null,
      owner?.npub ?? null,
      defaultRole,
      isPrivate,
      workspaceId
    ) ?? null
  );
}

export function getBoardById(id: number) {
  return getBoardStmt.get(id) ?? null;
}

export function listBoards(includeArchived: boolean) {
  return listBoardsStmt.all(includeArchived ? 1 : 0);
}

export function addBoardRenouncement(boardId: number, pubkey: string) {
  insertBoardRenouncementStmt.run(boardId, pubkey);
}

export function listBoardRenouncements(pubkey: string) {
  return listBoardRenouncementsStmt.all(pubkey).map((row) => row.board_id);
}

export function isBoardRenounced(boardId: number, pubkey: string) {
  return !!isBoardRenouncedStmt.get(boardId, pubkey);
}

export function updateBoardTitle(id: number, title: string) {
  return updateBoardTitleStmt.get(title, id) ?? null;
}

export function updateBoardDescription(id: number, description: string | null) {
  return updateBoardDescriptionStmt.get(description, id) ?? null;
}

export function updateBoardStarred(id: number, starred: number) {
  return updateBoardStarredStmt.get(starred, id) ?? null;
}

export function updateBoardDefaultRole(id: number, defaultRole: string) {
  return updateBoardDefaultRoleStmt.get(defaultRole, id) ?? null;
}

export function updateBoardPrivacy(id: number, isPrivate: number) {
  return updateBoardPrivacyStmt.get(isPrivate, id) ?? null;
}

export function deleteBoard(id: number) {
  return deleteBoardStmt.get(id) ?? null;
}

export function archiveBoard(id: number) {
  return archiveBoardStmt.get(id) ?? null;
}

export function unarchiveBoard(id: number) {
  return unarchiveBoardStmt.get(id) ?? null;
}

export function createBoardCopy(
  title: string,
  description: string | null,
  owner: { pubkey: string; npub: string } | null,
  defaultRole: string = "editor",
  isPrivate: number = 0,
  workspaceId: number | null = null
) {
  return (
    insertBoardCopyStmt.get(
      title,
      description ?? null,
      owner?.pubkey ?? null,
      owner?.npub ?? null,
      defaultRole,
      isPrivate,
      workspaceId
    ) ?? null
  );
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

export function listBoardAttachments(boardId: number) {
  return listBoardAttachmentsStmt.all(boardId);
}

export function getAttachment(boardId: number, attachmentId: string) {
  return getAttachmentStmt.get(attachmentId, boardId) ?? null;
}

export function resetDatabase() {
  db.run("DELETE FROM todos");
  db.run("DELETE FROM ai_summaries");
  db.run("DELETE FROM workspace_members");
  db.run("DELETE FROM workspaces");
  db.run("DELETE FROM board_members");
  db.run("DELETE FROM board_comments");
  db.run("DELETE FROM board_elements");
  db.run("DELETE FROM attachments");
  db.run("DELETE FROM board_renouncements");
  db.run("DELETE FROM boards");
  db.run("DELETE FROM sessions");
  db.run(
    "DELETE FROM sqlite_sequence WHERE name IN ('todos', 'ai_summaries', 'board_comments', 'boards', 'workspaces')"
  );
}

export function createSessionRecord(record: {
  token: string;
  pubkey: string;
  npub: string;
  method: string;
  createdAt: number;
  expiresAt: number;
}) {
  return (
    insertSessionStmt.get(
      record.token,
      record.pubkey,
      record.npub,
      record.method,
      record.createdAt,
      record.expiresAt
    ) ?? null
  );
}

export function getSessionByToken(token: string) {
  return getSessionStmt.get(token) ?? null;
}

export function deleteSessionByToken(token: string) {
  deleteSessionStmt.run(token);
}

export function deleteExpiredSessions(now: number) {
  deleteExpiredSessionsStmt.run(now);
}

export function deleteAttachmentsByBoard(boardId: number) {
  deleteBoardAttachmentsStmt.run(boardId);
}

export function upsertBoardMember(boardId: number, pubkey: string, role: string) {
  return upsertBoardMemberStmt.get(boardId, pubkey, role) ?? null;
}

export function listBoardMembers(boardId: number) {
  return listBoardMembersStmt.all(boardId);
}

export function getBoardMember(boardId: number, pubkey: string) {
  return getBoardMemberStmt.get(boardId, pubkey) ?? null;
}

export function deleteBoardMember(boardId: number, pubkey: string) {
  deleteBoardMemberStmt.run(boardId, pubkey);
}

export function createWorkspace(
  title: string,
  owner: { pubkey: string; npub: string } | null,
  isPersonal: number = 0
) {
  return insertWorkspaceStmt.get(title, owner?.pubkey ?? null, owner?.npub ?? null, isPersonal) ?? null;
}

export function getPersonalWorkspaceForPubkey(pubkey: string) {
  return findPersonalWorkspaceStmt.get(pubkey) ?? null;
}

export function getWorkspaceById(id: number) {
  return getWorkspaceStmt.get(id) ?? null;
}

export function listWorkspacesForMember(pubkey: string) {
  return listWorkspacesForMemberStmt.all(pubkey);
}

export function upsertWorkspaceMember(workspaceId: number, pubkey: string, role: string) {
  return upsertWorkspaceMemberStmt.get(workspaceId, pubkey, role) ?? null;
}

export function listWorkspaceMembers(workspaceId: number) {
  return listWorkspaceMembersStmt.all(workspaceId);
}

export function getWorkspaceMember(workspaceId: number, pubkey: string) {
  return getWorkspaceMemberStmt.get(workspaceId, pubkey) ?? null;
}

export function assignBoardsToWorkspaceByOwner(workspaceId: number, ownerPubkey: string) {
  updateBoardsWorkspaceByOwnerStmt.run(workspaceId, ownerPubkey);
}

export function getRecoveryWorkspace() {
  return recoveryWorkspaceStmt.get() ?? null;
}
