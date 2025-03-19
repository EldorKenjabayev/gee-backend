const fs = require("fs");
const path = require("path");
const db = require("./config/db");

const migrationsPath = path.join(__dirname, "migrations"); // ✅ Гарантируем правильный путь

async function runMigrations() {
  console.log("🔄 Проверка миграций...");

  // 🛠 Создаём папку migrations, если её нет
  if (!fs.existsSync(migrationsPath)) {
    fs.mkdirSync(migrationsPath, { recursive: true });
  }

  // 🛠 Проверяем таблицу migrations
  await db.none(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 🛠 Проверяем, есть ли миграции
  const migrationFiles = fs.readdirSync(migrationsPath).filter(f => f.endsWith(".sql"));
  if (migrationFiles.length === 0) {
    console.log("⚠ Нет файлов миграций! Пропускаем...");
    return;
  }

  // 🛠 Проверяем, какие миграции уже применены
  const appliedMigrations = await db.manyOrNone("SELECT filename FROM migrations");
  const appliedFiles = appliedMigrations.map(m => m.filename);

  let applied = 0;
  for (const file of migrationFiles) {
    if (!appliedFiles.includes(file)) {
      const filePath = path.join(migrationsPath, file);
      const sql = fs.readFileSync(filePath, "utf8");

      console.log(`📌 Применяем миграцию: ${file}`);
      await db.none(sql);
      await db.none("INSERT INTO migrations (filename) VALUES ($1)", [file]);
      applied++;
    }
  }

  if (applied > 0) {
    console.log(`✅ Применено ${applied} новых миграций.`);
  } else {
    console.log("👌 Все миграции уже применены.");
  }
}

module.exports = runMigrations;
