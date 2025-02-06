const express = require("express");
const axios = require("axios");
const db = require("../config/db");
const authMiddleware = require("../middleware/authMiddleware");
const { OAuth2Client } = require("google-auth-library");

const router = express.Router();

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);

async function refreshAccessToken(user) {
  try {
    if (!user.google_refresh_token) {
      console.error("❌ Ошибка: Нет refresh token, повторите вход в Google!");
      return null;
    }

    console.log("🔄 Обновляем Access Token...");
    const { tokens } = await client.refreshToken(user.google_refresh_token);
    console.log("✅ Новый Access Token:", tokens.access_token);

    await db.none("UPDATE users SET google_access_token = $1 WHERE id = $2", [
      tokens.access_token,
      user.id,
    ]);

    return tokens.access_token;
  } catch (error) {
    console.error("❌ Ошибка при обновлении Access Token:", error.message);
    return null;
  }
}

router.post("/", authMiddleware, async (req, res) => {
  try {
    const { startYear, endYear, polygon } = req.body;
    const userId = req.user.id;

    let user = await db.one("SELECT google_access_token, google_refresh_token FROM users WHERE id = $1", [userId]);

    let accessToken = user.google_access_token;

    if (!accessToken) {
      return res.status(401).json({ error: "Google Access Token не найден" });
    }

    // 🔄 Обновляем Access Token, если устарел
    accessToken = await refreshAccessToken(user) || accessToken;

    console.log("🚀 Access Token для запроса к GEE:", accessToken); // ✅ Проверяем, что токен есть

    const geeUrl = `https://earthengine.googleapis.com/v1/projects/${process.env.GEE_PROJECT}/maps`;

    const requestData = {
      expression: {
        collection: "MODIS/006/MOD13A1",
        filter: {
          bounds: polygon,
          startTime: `${startYear}-01-01`,
          endTime: `${endYear}-12-31`,
        },
        select: ["NDVI"],
      },
    };

    const response = await axios.post(geeUrl, requestData, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    await db.none(
      "INSERT INTO ndvi_cache (user_id, start_year, end_year, region, data) VALUES ($1, $2, $3, $4, $5)",
      [userId, startYear, endYear, JSON.stringify(polygon), JSON.stringify(response.data)]
    );

    res.json({ ndvi: response.data });
  } catch (error) {
    console.error("❌ Ошибка при получении NDVI:", error.response?.data || error.message);
    res.status(500).json({ error: "Ошибка при получении данных NDVI", details: error.message });
  }
});


module.exports = router;
