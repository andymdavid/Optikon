import { Database } from "bun:sqlite";
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
const addColumn = (sql) => {
    try {
        db.run(sql);
    }
    catch (error) {
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
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);
function ensureBoardElementsSchema() {
    const info = db.query(`PRAGMA table_info('board_elements')`).all();
    const idColumn = info.find((column) => column.name === "id");
    if (!idColumn) {
        createBoardElementsTable();
        return;
    }
    if (idColumn.type?.toUpperCase() === "TEXT")
        return;
    db.run(`ALTER TABLE board_elements RENAME TO board_elements_legacy`);
    createBoardElementsTable();
    const legacyRows = db
        .query(`SELECT id, board_id, type, props_json, created_at, updated_at FROM board_elements_legacy`)
        .all();
    const insertStmt = db.query(`INSERT OR REPLACE INTO board_elements (id, board_id, type, props_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`);
    for (const row of legacyRows) {
        let elementId = null;
        try {
            const parsed = JSON.parse(row.props_json);
            if (typeof parsed?.id === "string" && parsed.id.trim()) {
                elementId = parsed.id;
            }
        }
        catch (_error) {
            // ignore malformed legacy data
        }
        if (!elementId)
            elementId = String(row.id);
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
const listByOwnerStmt = db.query("SELECT * FROM todos WHERE deleted = 0 AND owner = ? ORDER BY created_at DESC");
const listScheduledStmt = db.query(`SELECT * FROM todos
   WHERE deleted = 0
     AND owner = ?
     AND scheduled_for IS NOT NULL
     AND scheduled_for != ''
     AND date(scheduled_for) <= date(?)
   ORDER BY scheduled_for ASC, created_at DESC`);
const listUnscheduledStmt = db.query(`SELECT * FROM todos
   WHERE deleted = 0
     AND owner = ?
     AND (scheduled_for IS NULL OR scheduled_for = '')
   ORDER BY created_at DESC`);
const insertStmt = db.query("INSERT INTO todos (title, description, priority, state, done, owner, tags) VALUES (?, '', 'sand', 'new', 0, ?, ?) RETURNING *");
const insertFullStmt = db.query(`INSERT INTO todos (title, description, priority, state, done, owner, scheduled_for, tags)
   VALUES (?, ?, ?, ?, CASE WHEN ? = 'done' THEN 1 ELSE 0 END, ?, ?, ?)
   RETURNING *`);
const deleteStmt = db.query("UPDATE todos SET deleted = 1 WHERE id = ? AND owner = ?");
const updateStmt = db.query(`UPDATE todos
   SET
    title = ?,
    description = ?,
    priority = ?,
    state = ?,
    done = CASE WHEN ? = 'done' THEN 1 ELSE 0 END,
    scheduled_for = ?,
    tags = ?
   WHERE id = ? AND owner = ?
   RETURNING *`);
const transitionStmt = db.query(`UPDATE todos
   SET
    state = ?,
    done = CASE WHEN ? = 'done' THEN 1 ELSE 0 END
   WHERE id = ? AND owner = ?
   RETURNING *`);
const upsertSummaryStmt = db.query(`INSERT INTO ai_summaries (owner, summary_date, day_ahead, week_ahead, suggestions)
   VALUES (?, ?, ?, ?, ?)
   ON CONFLICT(owner, summary_date) DO UPDATE SET
     day_ahead = excluded.day_ahead,
     week_ahead = excluded.week_ahead,
     suggestions = excluded.suggestions,
     updated_at = CURRENT_TIMESTAMP
   RETURNING *`);
const latestDaySummaryStmt = db.query(`SELECT * FROM ai_summaries
   WHERE owner = ? AND summary_date = ?
   ORDER BY updated_at DESC
   LIMIT 1`);
const latestWeekSummaryStmt = db.query(`SELECT * FROM ai_summaries
   WHERE owner = ? AND summary_date BETWEEN ? AND ?
   ORDER BY updated_at DESC
   LIMIT 1`);
const insertBoardStmt = db.query(`INSERT INTO boards (title)
   VALUES (?)
   RETURNING *`);
const getBoardStmt = db.query(`SELECT * FROM boards WHERE id = ?`);
const listBoardElementsStmt = db.query(`SELECT * FROM board_elements
   WHERE board_id = ?
   ORDER BY created_at ASC`);
const upsertBoardElementStmt = db.query(`INSERT INTO board_elements (id, board_id, type, props_json)
   VALUES (?, ?, ?, ?)
   ON CONFLICT(id) DO UPDATE SET
     board_id = excluded.board_id,
     type = excluded.type,
     props_json = excluded.props_json,
     updated_at = CURRENT_TIMESTAMP
   RETURNING *`);
const getBoardElementStmt = db.query(`SELECT * FROM board_elements WHERE id = ? AND board_id = ?`);
const updateBoardElementStmt = db.query(`UPDATE board_elements
   SET props_json = ?, updated_at = CURRENT_TIMESTAMP
   WHERE id = ? AND board_id = ?
   RETURNING *`);
const deleteBoardElementStmt = db.query(`DELETE FROM board_elements WHERE id = ? AND board_id = ?`);
export function listTodos(owner, filterTags) {
    if (!owner)
        return [];
    const todos = listByOwnerStmt.all(owner);
    if (!filterTags || filterTags.length === 0)
        return todos;
    // Filter todos that have at least one of the specified tags
    return todos.filter((todo) => {
        const todoTags = todo.tags ? todo.tags.split(",").map((t) => t.trim().toLowerCase()) : [];
        return filterTags.some((ft) => todoTags.includes(ft.toLowerCase()));
    });
}
export function listScheduledTodos(owner, endDate) {
    return listScheduledStmt.all(owner, endDate);
}
export function listUnscheduledTodos(owner) {
    return listUnscheduledStmt.all(owner);
}
export function addTodo(title, owner, tags = "") {
    if (!title.trim())
        return null;
    const todo = insertStmt.get(title.trim(), owner, tags);
    return todo ?? null;
}
export function addTodoFull(owner, fields) {
    const title = fields.title?.trim();
    if (!title)
        return null;
    const description = fields.description?.trim() ?? "";
    const priority = fields.priority ?? "sand";
    const state = fields.state ?? "new";
    const scheduled_for = fields.scheduled_for ?? null;
    const tags = fields.tags?.trim() ?? "";
    const todo = insertFullStmt.get(title, description, priority, state, state, owner, scheduled_for, tags);
    return todo ?? null;
}
export function deleteTodo(id, owner) {
    deleteStmt.run(id, owner);
}
export function updateTodo(id, owner, fields) {
    const todo = updateStmt.get(fields.title, fields.description, fields.priority, fields.state, fields.state, fields.scheduled_for, fields.tags, id, owner);
    return todo ?? null;
}
export function transitionTodo(id, owner, state) {
    const todo = transitionStmt.get(state, state, id, owner);
    return todo ?? null;
}
export function assignAllTodosToOwner(npub) {
    if (!npub)
        return;
    db.run("UPDATE todos SET owner = ? WHERE owner = '' OR owner IS NULL", npub);
}
export function upsertSummary({ owner, summaryDate, dayAhead, weekAhead, suggestions, }) {
    const summary = upsertSummaryStmt.get(owner, summaryDate, dayAhead, weekAhead, suggestions);
    return summary ?? null;
}
export function getLatestSummaries(owner, today, weekStart, weekEnd) {
    const day = latestDaySummaryStmt.get(owner, today);
    const week = latestWeekSummaryStmt.get(owner, weekStart, weekEnd);
    return { day: day ?? null, week: week ?? null };
}
export function createBoard(title) {
    return insertBoardStmt.get(title) ?? null;
}
export function getBoardById(id) {
    return getBoardStmt.get(id) ?? null;
}
export function listBoardElements(boardId) {
    return listBoardElementsStmt.all(boardId);
}
export function insertOrUpdateBoardElement(boardId, elementId, type, propsJson) {
    return upsertBoardElementStmt.get(elementId, boardId, type, propsJson) ?? null;
}
export function getBoardElement(boardId, elementId) {
    return getBoardElementStmt.get(elementId, boardId) ?? null;
}
export function updateBoardElement(boardId, elementId, propsJson) {
    return updateBoardElementStmt.get(propsJson, elementId, boardId) ?? null;
}
export function deleteBoardElements(boardId, ids) {
    let removed = 0;
    for (const id of ids) {
        if (!id)
            continue;
        const existing = getBoardElementStmt.get(id, boardId);
        if (!existing)
            continue;
        deleteBoardElementStmt.run(id, boardId);
        removed += 1;
    }
    return removed;
}
export function resetDatabase() {
    db.run("DELETE FROM todos");
    db.run("DELETE FROM ai_summaries");
    db.run("DELETE FROM sqlite_sequence WHERE name IN ('todos', 'ai_summaries')");
}
