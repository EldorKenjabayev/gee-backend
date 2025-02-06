const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const db = require("../config/db");
const { OAuth2Client } = require("google-auth-library");

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);

async function getAccessTokenFromRefreshToken(refreshToken) {
  try {
    console.log("🔄 Обновляем Access Token через Refresh Token...");
    const { tokens } = await client.refreshToken(refreshToken);
    console.log("✅ Новый Access Token:", tokens.access_token);
    return tokens.access_token;
  } catch (error) {
    console.error("❌ Ошибка при обновлении Access Token через Refresh Token:", error.message);
    return null;
  }
}

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
      accessType: "offline",
      prompt: "consent",
      scope: [
        "email",  // ✅ Гарантирует, что вернется email
        "profile",
        "openid",  // ✅ Обязательно для ID-токена
        "https://www.googleapis.com/auth/userinfo.email",  // ✅ Дополнительная проверка email
        "https://www.googleapis.com/auth/userinfo.profile",
        "https://www.googleapis.com/auth/devstorage.read_only",
        "https://www.googleapis.com/auth/earthengine.readonly",
      ],
    },
    async (req, accessToken, refreshToken, profile, done) => {
      console.log("🔥 Google OAuth Response:");
      console.log("Access Token:", accessToken);
      console.log("Refresh Token (до обработки):", refreshToken);

      try {
        const email = profile.emails?.[0]?.value;
        const google_id = profile.id;

        if (!email) {
          return done(null, false, { message: "Google не вернул email" });
        }

        // ✅ Исправляем ошибку с JSON в refreshToken
        let refreshTokenString =
          typeof refreshToken === "string"
            ? refreshToken
            : refreshToken?.access_token || null;

        // Если refresh_token не пришел, но есть в БД — используем его
        // ✅ Уже правильно, добавили логи
        if (!refreshTokenString) {
          console.log("🔄 Используем сохраненный refresh_token из БД...");
          const userFromDB = await db.oneOrNone("SELECT google_refresh_token FROM users WHERE google_id = $1", [google_id]);
          refreshTokenString = userFromDB?.google_refresh_token || null;
        }

        console.log("🔍 Итоговый refresh_token для пользователя:", refreshTokenString ? "Найден" : "Нет refresh_token!");



        // Если нет accessToken, пробуем получить через refreshToken
        if (!accessToken && refreshTokenString) {
          console.log("🔄 Пробуем получить Access Token через Refresh Token...");
          accessToken = await getAccessTokenFromRefreshToken(refreshTokenString);
          console.log("✅ Новый Access Token через Refresh Token:", accessToken);
        }

        if (!accessToken) {
          return done(null, false, { message: "Не удалось получить Access Token" });
        }

        let user = await db.oneOrNone("SELECT * FROM users WHERE google_id = $1", [google_id]);

        if (!user) {
          user = await db.one(
            "INSERT INTO users (email, google_id, google_access_token, google_refresh_token) VALUES ($1, $2, $3, $4) RETURNING *",
            [email, google_id, accessToken, refreshTokenString]
          );
        } else {
          await db.none(
            "UPDATE users SET google_access_token = $1, google_refresh_token = COALESCE($2, google_refresh_token) WHERE google_id = $3",
            [accessToken, refreshTokenString, google_id]
          );
        }

        return done(null, user);
      } catch (error) {
        return done(error, false);
      }
    }
  )
);

module.exports = passport;
