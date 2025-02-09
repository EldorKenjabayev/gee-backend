const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const db = require("./db");
const { OAuth2Client } = require("google-auth-library");

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
        "https://www.googleapis.com/auth/earthengine.readonly",
        "https://www.googleapis.com/auth/cloud-platform"
      ]
    },
    async (req, accessToken, refreshToken, profile, done) => {
      console.log("🔥 Google OAuth Response:");
      console.log("Access Token:", accessToken);
      console.log("Refresh Token:", refreshToken);
      console.log("Profile:", profile);

      try {
        const email = profile.emails?.[0]?.value;
        const google_id = profile.id;

        if (!email || !accessToken || !refreshToken) {
          return done(null, false, { message: "Google не вернул email, access_token или refresh_token" });
        }

        let user = await db.oneOrNone("SELECT * FROM users WHERE google_id = $1", [google_id]);

        if (!user) {
          user = await db.one(
            "INSERT INTO users (email, google_id, google_access_token, google_refresh_token) VALUES ($1, $2, $3, $4) RETURNING *",
            [email, google_id, accessToken, refreshToken]
          );
        } else {
          await db.none(
            "UPDATE users SET google_access_token = $1, google_refresh_token = COALESCE($2, google_refresh_token) WHERE google_id = $3",
            [accessToken, refreshToken, google_id]
          );
        }

        return done(null, { email, google_id, accessToken, refreshToken }); // ✅ Передаём все данные
      } catch (error) {
        return done(error, false);
      }
    }
  )
);

module.exports = passport;
