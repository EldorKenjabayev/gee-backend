const pgp = require("pg-promise")({
  capSQL: true, // Оптимизирует запросы INSERT/UPDATE
});
require("dotenv").config();

const db = pgp({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  max: 10,
  idleTimeoutMillis: 30000, // Таймаут простоя соединения
});

module.exports = db;
