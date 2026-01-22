import { Database } from "bun:sqlite";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");

const dbPath = Bun.env.DB_PATH || "do-the-other-stuff.sqlite";
const db = new Database(dbPath);
db.run("PRAGMA foreign_keys = ON");

const listStmt = db.query(
  `SELECT id, title, created_at, updated_at
   FROM boards
   WHERE owner_pubkey IS NULL OR owner_pubkey = ''
   ORDER BY created_at ASC`
);
const rows = listStmt.all();

if (rows.length === 0) {
  console.log("No ownerless boards found.");
  process.exit(0);
}

console.log(`Found ${rows.length} ownerless board(s):`);
rows.forEach((row) => {
  console.log(`- #${row.id} "${row.title}" (created ${row.created_at}, updated ${row.updated_at})`);
});

if (!apply) {
  console.log("\nDry run only. Re-run with --apply to delete these boards.");
  process.exit(0);
}

const deleteStmt = db.query(
  `DELETE FROM boards WHERE owner_pubkey IS NULL OR owner_pubkey = ''`
);
const result = deleteStmt.run();
console.log(`\nDeleted ${result.changes ?? 0} board(s).`);
