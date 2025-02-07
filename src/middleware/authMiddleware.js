const db = require("../config/db");
const jwt = require("jsonwebtoken");
const redis = require("../config/redis");

async function authMiddleware(req, res, next) {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Токен отсутствует" });

    // Проверяем кеш в Redis
    const cachedUser = await redis.get(`token:${token}`);
    if (cachedUser) {
      req.user = JSON.parse(cachedUser);
      return next();
    }

    // Декодируем JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await db.oneOrNone("SELECT * FROM users WHERE email = $1", [decoded.email]);

    if (!user) return res.status(401).json({ error: "Неверный токен" });

    // Кешируем пользователя на 1 час
    await redis.setex(`token:${token}`, 3600, JSON.stringify(user));

    req.user = user;
    next();
  } catch (error) {
    console.error("Ошибка аутентификации:", error);
    res.status(401).json({ error: "Ошибка аутентификации" });
  }
}

module.exports = authMiddleware;
