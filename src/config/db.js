const pgp = require("pg-promise")();
require("dotenv").config();

const db = pgp({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

module.exports = db;
