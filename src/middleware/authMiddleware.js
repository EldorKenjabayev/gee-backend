const db = require("../config/db");
const jwt = require("jsonwebtoken");

async function authMiddleware(req, res, next) {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    console.log("Received token:", token); // Логируем полученный токен
    if (!token) {
      return res.status(401).json({ error: "Токен отсутствует" });
    }

    // Проверяем токен
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("Decoded token:", decoded); // Логируем декодированный токен

    // Проверяем, есть ли токен в базе
    const user = await db.oneOrNone("SELECT * FROM users WHERE email = $1 AND token = $2", [
      decoded.email,
      token,
    ]);

    if (!user) {
      return res.status(401).json({ error: "Неверный токен" });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("Authentication error:", error); // Логируем ошибку
    res.status(401).json({ error: "Ошибка аутентификации" });
  }
}

module.exports = authMiddleware;
