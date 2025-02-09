const express = require("express");
const passport = require("passport");
const db = require("../config/db");
const jwt = require("jsonwebtoken");

const router = express.Router();

// 🔥 Google OAuth'ga yo‘naltirish
router.get(
  "/",
  passport.authenticate("google", {
    scope: [
      "profile",
      "email",
      "https://www.googleapis.com/auth/devstorage.read_only",
      "https://www.googleapis.com/auth/earthengine",
    ],
    accessType: "offline", // ✅ Refresh Token olish uchun kerak
    prompt: "consent",
  })
);

// 🔥 Google OAuth Callback
router.get(
  "/callback",
  passport.authenticate("google", { session: false }),
  async (req, res) => {
    try {
      console.log("🔥 Google OAuth muvaffaqiyatli:", req.user);

      const { email, google_id, accessToken, refreshToken } = req.user;

      if (!email || !accessToken) {
        return res.status(400).json({ error: "Google email yoki access_token qaytarmadi" });
      }

      // 🔍 Foydalanuvchini tekshiramiz
      let user = await db.oneOrNone("SELECT * FROM users WHERE google_id = $1", [google_id]);

      if (!user) {
        console.log("🆕 Yangi foydalanuvchi yaratilyapti...");
        await db.none(
          "INSERT INTO users (email, google_id, google_access_token, google_refresh_token) VALUES ($1, $2, $3, $4)",
          [email, google_id, accessToken, refreshToken]
        );
      } else {
        console.log("🔄 Foydalanuvchi ma'lumotlari yangilanmoqda...");
        await db.none(
          "UPDATE users SET google_access_token = $1, google_refresh_token = COALESCE($2, google_refresh_token) WHERE google_id = $3",
          [accessToken, refreshToken, google_id]
        );
      }

      // ✅ JWT yaratish (Google ID va Email asosida)
      const token = jwt.sign({ email, google_id }, process.env.JWT_SECRET, { expiresIn: "7d" });

      console.log("✅ Foydalanuvchi ma'lumotlari saqlandi!");
      res.redirect(`http://localhost:5173/google/callback?token=${token}`);
    } catch (error) {
      console.error("❌ Google orqali avtorizatsiya xatosi:", error);
      res.status(500).json({ error: "Ошибка авторизации" });
    }
  }
);

module.exports = router;
