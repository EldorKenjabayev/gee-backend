const jwt = require("jsonwebtoken");
const axios = require("axios");
const db = require("../config/db");
const redis = require("../config/redis");
const { OAuth2Client } = require("google-auth-library");

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

async function authMiddleware(req, res, next) {
  try {
    // Читаем заголовок Authorization: Bearer ...
    const bearer = req.headers.authorization;
    if (!bearer) {
      return res.status(401).json({ error: "Токен отсутствует" });
    }

    const token = bearer.split(" ")[1];
    if (!token) {
      return res.status(401).json({ error: "Токен отсутствует" });
    }

    // 1) Проверяем кэш (Redis)
    const cachedUser = await redis.get(`token:${token}`);
    if (cachedUser) {
      req.user = JSON.parse(cachedUser);
      return next();
    }

    let user;
    // 2) Определяем тип
    if (token.startsWith("ya29.")) {
      // === Google Access Token ===
      console.log("🔍 Google Access Token!");
      const { data } = await axios.get("https://www.googleapis.com/oauth2/v1/userinfo", {
        headers: { Authorization: `Bearer ${token}` },
      });
      // Ищем в БД
      user = await db.oneOrNone("SELECT * FROM users WHERE email = $1", [data.email]);
      if (!user) {
        return res.status(401).json({ error: "Пользователь не найден" });
      }
    } else {
      // === Предположим, это JWT ===
      console.log("🔍 Проверяем JWT!");
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      // payload = { email, google_id, iat, exp }
      // Ищем пользователя. Допустим, ищем по google_id
      user = await db.oneOrNone("SELECT * FROM users WHERE google_id = $1", [payload.google_id]);
      if (!user) {
        return res.status(401).json({ error: "Пользователь не найден по JWT" });
      }
    }
    //wdeiiiidewn
    // 3) Кэшируем в Redis на час (3600 сек)
    await redis.setex(`token:${token}`, 3600, JSON.stringify(user));

    req.user = user;
    next();
  } catch (error) {
    console.error("❌ Ошибка аутентификации:", error);
    return res.status(401).json({ error: "Ошибка аутентификации" });
  }
}

module.exports = authMiddleware;
