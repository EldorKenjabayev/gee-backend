const { OAuth2Client } = require("google-auth-library");
const db = require("../config/db");
const redis = require("../config/redis");

const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
);

async function refreshAccessToken(user) {
  try {
    if (!user.google_refresh_token) {
      console.error("❌ Ошибка: Нет Refresh Token, повторите вход в Google!");
      return null;
    }

    console.log("🔄 Запрашиваем новый Access Token через Refresh Token...");

    // ✅ Используем getToken(), а не refreshToken()
    const { tokens } = await client.getToken({
      refresh_token: user.google_refresh_token,
    });

    if (!tokens || !tokens.access_token) {
      console.error("❌ Google не вернул новый Access Token!");
      return null;
    }

    console.log("✅ Новый Access Token:", tokens.access_token);

    // ✅ Обновляем Access Token в БД
    await db.none("UPDATE users SET google_access_token = $1 WHERE id = $2", [
      tokens.access_token,
      user.id,
    ]);

    // ✅ Кешируем Access Token в Redis (чтобы не запрашивать БД каждый раз)
    await redis.setex(`google_access_token:${user.id}`, 3500, tokens.access_token); // 58 минут

    return tokens.access_token;
  } catch (error) {
    console.error("❌ Ошибка при обновлении Access Token:", error.message);

    if (error.message.includes("invalid_grant")) {
      console.error("❌ Refresh Token недействителен. Пользователю нужно повторно войти через Google.");
      return null;
    }

    return null;
  }
}

module.exports = { refreshAccessToken };
