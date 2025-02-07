const db = require("../config/db");

async function attachUser(req, res, next) {
  try {
    if (!req.userId) return next();

    const user = await db.oneOrNone("SELECT * FROM users WHERE id = $1", [req.userId]);
    if (!user) return res.status(401).json({ error: "Пользователь не найден" });

    req.user = user;
    next();
  } catch (error) {
    res.status(500).json({ error: "Ошибка при получении пользователя" });
  }
}

module.exports = attachUser;
