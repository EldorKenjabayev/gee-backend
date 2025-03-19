const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const db = require("./db");
// Если нужно, подключаете { OAuth2Client } = require("google-auth-library");

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
      passReqToCallback: true,
      accessType: "offline",
      prompt: "consent",
      scope: [
        "email",
        "profile",
        "openid",
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile",
        "https://www.googleapis.com/auth/devstorage.read_only",
        "https://www.googleapis.com/auth/earthengine.readonly",
      ],
    },
    async (req, accessToken, refreshToken, profile, done) => {
      console.log("🔥 Google OAuth Response:");
      console.log("Access Token:", accessToken);
      console.log("Refresh Token:", refreshToken);
      console.log("Profile:", profile);

      try {
        // 1. Получаем email и google_id
        const email = profile.emails?.[0]?.value;
        const google_id = profile.id;

        // 2. Проверяем минимум: email и accessToken
        if (!email || !accessToken) {
          return done(null, false, {
            message: "Google не вернул email или access_token",
          });
        }

        // (refreshToken может быть undefined, особенно при повторной авторизации)

        // 3. Проверяем пользователя в БД
        let user = await db.oneOrNone("SELECT * FROM users WHERE google_id = $1", [google_id]);

        if (!user) {
          // Если пользователя нет, создаём
          user = await db.one(
            `INSERT INTO users (email, google_id, token,  google_access_token, google_refresh_token)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [email, google_id, token, accessToken, refreshToken]
          );
        } else {
          // Если есть, обновляем только access и refresh (refresh - опционально)
          await db.none(
            `UPDATE users
             SET google_access_token = $1,
                 google_refresh_token = COALESCE($2, google_refresh_token)
             WHERE google_id = $3`,
            [accessToken, refreshToken, google_id]
          );
        }
        return done(null, {
          email,
          google_id,
          accessToken,
          refreshToken,
        });
      } catch (error) {
        return done(error, false);
      }
    }
  )
);

module.exports = passport;
