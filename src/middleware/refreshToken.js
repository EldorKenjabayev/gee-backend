const { OAuth2Client } = require("google-auth-library");
const db = require("../config/db");

const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
);

async function refreshAccessToken(user) {
  try {
    if (!user.google_refresh_token) {
      console.error("❌ Ошибка: Нет refresh token, повторите вход в Google!");
      return null;
    }

    console.log("🔄 Обновляем Access Token...");
    const { tokens } = await client.getToken(user.google_refresh_token); // ✅ Исправлено!

    if (!tokens || !tokens.access_token) {
      console.error("❌ Ошибка: Google не вернул новый Access Token!");
      return null;
    }

    console.log("✅ Новый Access Token:", tokens.access_token);

    await db.none("UPDATE users SET google_access_token = $1 WHERE id = $2", [
      tokens.access_token,
      user.id,
    ]);

    return tokens.access_token;
  } catch (error) {
    console.error("❌ Ошибка при обновлении Access Token:", error.message);
    if (error.message.includes("invalid_grant")) {
      console.error("❌ Refresh token недействителен. Повторите вход в Google.");
      return null;
    }
    return null;
  }
}

module.exports = { refreshAccessToken };
