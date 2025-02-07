const express = require("express");
const axios = require("axios");
const db = require("../config/db");
const authMiddleware = require("../middleware/authMiddleware");
const redis = require("../config/redis");
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
    const { tokens } = await client.getToken({
      refresh_token: user.google_refresh_token,
    });

    if (!tokens || !tokens.access_token) {
      console.error("❌ Ошибка: Google не вернул новый Access Token!");
      return null;
    }

    console.log("✅ Новый Access Token:", tokens.access_token);

    // ✅ Обновляем Access Token в БД
    await db.none("UPDATE users SET google_access_token = $1 WHERE id = $2", [
      tokens.access_token,
      user.id,
    ]);

    // ✅ Кешируем в Redis (чтобы не запрашивать БД каждый раз)
    await redis.setex(`google_access_token:${user.id}`, 3500, tokens.access_token);

    return tokens.access_token;
  } catch (error) {
    console.error("❌ Ошибка при обновлении Access Token:", error.message);
    return null;
  }
}

router.post("/", authMiddleware, async (req, res) => {
  console.log("🔥 Запрос на NDVI API получен!");
  console.log("📌 Входные данные запроса:", req.body);

  try {
    const { startYear, endYear, polygon } = req.body;
    const userId = req.user.id;

    console.log("👤 Пользователь:", userId);
    console.log("📅 Даты:", { startYear, endYear });
    console.log("📌 Координаты:", polygon);

    // Проверяем кеш Redis перед SQL-запросом
    let accessToken = await redis.get(`google_access_token:${userId}`);

    if (!accessToken) {
      console.log("🔎 Access Token не найден в Redis. Проверяем в БД...");
      let user = await db.one("SELECT google_access_token, google_refresh_token FROM users WHERE id = $1", [userId]);
      accessToken = user.google_access_token;

      if (!accessToken) {
        console.log("🔄 Принудительное обновление Access Token...");
        accessToken = await refreshAccessToken(user);

        if (accessToken) {
          console.log("✅ Access Token обновлён и сохранён!");
          await redis.setex(`google_access_token:${userId}`, 3500, accessToken);
        }
      }
    }

    if (!accessToken) {
      console.error("❌ Ошибка: Google Access Token не найден!");
      return res.status(401).json({ error: "Google Access Token не найден" });
    }

    console.log("🔑 Используем Access Token:", accessToken);

    console.log("🚀 Отправляем запрос в Google Earth Engine...");


    const geeUrl = `https://earthengine.googleapis.com/v1/projects/${process.env.GEE_PROJECT}/functions:run`;




    const requestData = {
      expression: {
        code: `
          var uzbekistan = ee.FeatureCollection("FAO/GAUL/2015/level0")
            .filter(ee.Filter.eq('ADM0_NAME', 'Uzbekistan'));
    
          var ndviCollection = ee.ImageCollection("MODIS/006/MOD13A1")
            .filterBounds(uzbekistan)
            .filter(ee.Filter.calendarRange(${startYear}, ${endYear}, 'year'))
            .select('NDVI');
    
          var meanNDVIImage = ndviCollection.mean().multiply(0.0001).clip(uzbekistan);
    
          var chartData = ndviCollection.map(function(image) {
            return ee.Feature(null, {
              NDVI: image.reduceRegion(ee.Reducer.mean(), uzbekistan, 5000).get("NDVI"),
              date: image.date().format("YYYY-MM-dd")
            });
          }).aggregate_array("NDVI");
    
          return chartData;
        `,
      },
    };




    console.log("🔗 URL запроса в GEE:", geeUrl);
    console.log("📡 JSON запроса:", JSON.stringify(requestData, null, 2));


    const response = await axios.post(geeUrl, requestData, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    console.log("✅ Ответ от GEE:", response.data);

    res.json({ ndvi: response.data });
  } catch (error) {
    console.error("❌ Ошибка при получении NDVI:", error.response?.data || error.message);
    res.status(500).json({ error: "Ошибка при получении данных NDVI", details: error.message });
  }
});

module.exports = router;
