const { OAuth2Client } = require("google-auth-library");
const axios = require("axios");
const db = require("../config/db");
const redis = require("../config/redis");

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

async function authMiddleware(req, res, next) {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Токен отсутствует" });

    // 1️⃣ Redis'ni tekshirish
    const cachedUser = await redis.get(`token:${token}`);
    if (cachedUser) {
      req.user = JSON.parse(cachedUser);
      return next();
    }

    let user;

    // 2️⃣ Google Access Token bo‘lsa, uni Google UserInfo API orqali tekshiramiz
    if (token.startsWith("ya29.")) {
      console.log("🔍 Google Access Token aniqlangan!");
      
      // ✅ Google UserInfo API orqali foydalanuvchini tekshirish
      const { data } = await axios.get("https://www.googleapis.com/oauth2/v1/userinfo", {
        headers: { Authorization: `Bearer ${token}` },
      });

      user = await db.oneOrNone("SELECT * FROM users WHERE email = $1", [data.email]);

      if (!user) return res.status(401).json({ error: "Пользователь не найден" });

    } else {
      return res.status(401).json({ error: "Неверный формат токена" });
    }

    // 3️⃣ Redis'ga cache qilish
    await redis.setex(`token:${token}`, 3600, JSON.stringify(user));

    req.user = user;
    next();
  } catch (error) {
    console.error("❌ Ошибка аутентификации:", error.message);
    res.status(401).json({ error: "Ошибка аутентификации" });
  }
}

module.exports = authMiddleware;
