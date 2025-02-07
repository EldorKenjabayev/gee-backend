const express = require("express");
const passport = require("passport");
const db = require("../config/db");
const jwt = require("jsonwebtoken");

const router = express.Router();

// 🔥 Перенаправление на Google OAuth
router.get(
  "/",
  passport.authenticate("google", {
    scope: [
      "profile",
      "email",
      "https://www.googleapis.com/auth/devstorage.read_only",
      "https://www.googleapis.com/auth/earthengine.readonly",
    ],
    accessType: "offline", // 🔥 Важно! Даёт Refresh Token
    prompt: "consent",
  })
);

// 🔥 Обработка callback от Google
router.get(
  "/callback",
  passport.authenticate("google", { session: false }),
  async (req, res) => {
    try {
      console.log("🔥 Google OAuth успешен:", req.user);

      const { email, google_id, accessToken, refreshToken } = req.user;

      if (!email || !accessToken || !refreshToken) {
        return res.status(400).json({ error: "Google не вернул email, access_token или refresh_token" });
      }

      // Генерируем JWT-токен
      const token = jwt.sign({ email, google_id }, process.env.JWT_SECRET, { expiresIn: "7d" });

      // ✅ Сохраняем Access Token и Refresh Token правильно
      await db.none(
        "UPDATE users SET token = $1, google_access_token = $2, google_refresh_token = $3 WHERE google_id = $4",
        [token, accessToken, refreshToken, google_id]
      );

      console.log("✅ Access Token и Refresh Token сохранены!");
      res.redirect(`http://localhost:5173/google/callback?token=${token}`);
    } catch (error) {
      console.error("❌ Ошибка авторизации через Google:", error);
      res.status(500).json({ error: "Ошибка авторизации" });
    }
  }
);

module.exports = router;
