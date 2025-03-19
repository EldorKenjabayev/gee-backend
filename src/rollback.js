const fs = require("fs");
const path = require("path");
const db = require("./config/db");

async function rollbackLastMigration() {
  console.log("🔄 Откат последней миграции...");
  const lastMigration = await db.oneOrNone("SELECT filename FROM migrations ORDER BY applied_at DESC LIMIT 1");

  if (!lastMigration) {
    console.log("❌ Нет миграций для отката.");
    return;
  }

  const filePath = path.join(__dirname, "migrations", lastMigration.filename);
  const sql = fs.readFileSync(filePath, "utf8");

  // Автоматически формируем SQL для отката
  const rollbackSQL = sql.replace(/CREATE TABLE (.+?) \(/g, "DROP TABLE IF EXISTS $1");

  try {
    await db.none(rollbackSQL);
    await db.none("DELETE FROM migrations WHERE filename = $1", [lastMigration.filename]);
    console.log("✅ Миграция успешно откатана!");
  } catch (err) {
    console.error("❌ Ошибка при откате миграции:", err);
  }
}

rollbackLastMigration();
