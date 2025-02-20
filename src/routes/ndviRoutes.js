const express = require("express");
const axios = require("axios");
const db = require("../config/db");
const authMiddleware = require("../middleware/authMiddleware");
const redis = require("../config/redis");
const { OAuth2Client } = require("google-auth-library");

const router = express.Router();
const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
);

// Эндпоинт для получения временного ряда NDVI (через eval:evalscript)
router.post("/ndvi-time-series", authMiddleware, async (req, res) => {
  console.log("🔥 NDVI Time Series API: запрос получен!");
  console.log("📌 Параметры запроса:", req.body);

  try {
    // Извлекаем параметры из тела запроса
    const { startYear, endYear, polygon } = req.body;
    const userId = req.user.id;

    // 1) Находим Access Token в Redis или БД
    let accessToken = await redis.get(`google_access_token:${userId}`);
    if (!accessToken) {
      console.log("🔎 Access Token не найден в Redis. Ищем в БД...");
      const user = await db.one(
        "SELECT google_access_token FROM users WHERE id = $1",
        [userId]
      );
      accessToken = user.google_access_token;
    }

    if (!accessToken) {
      return res
        .status(401)
        .json({ error: "Google Access Token отсутствует!" });
    }

    console.log("🔑 Используемый Access Token:", accessToken);

    // 2) Собираем URL для evalscript
    //    Обратите внимание на двоеточие перед evalscript:  ... /projects/xxx:evalscript
    const geeUrl = `https://earthengine.googleapis.com/v1/projects/my-earth-engine-app:run`;
    // Формируем даты в формате "YYYY-MM-DD"
    const startDate = `${startYear}-01-01`;
    const endDate = `${endYear}-12-31`;

    // 3) Пишем GEE-скрипт строкой
    //    (evalscript позволяет использовать JS-код напрямую)
    const script = `
      // Определяем регион, используя переданные координаты
      var region = ee.Geometry.Polygon(${JSON.stringify(polygon)});
      
      // Формируем коллекцию MODIS NDVI
      var collection = ee.ImageCollection("MODIS/006/MOD13A1")
        .filterBounds(region)
        .filterDate("${startDate}", "${endDate}")
        .select("NDVI");
      
      // Функция для вычисления среднего NDVI и добавления его в свойства
      var addMeanNdvi = function(image) {
        var meanDict = image.reduceRegion({
          reducer: ee.Reducer.mean(),
          geometry: region,
          scale: 250
        });
        
        // Учитываем масштабирование NDVI (x 0.0001)
        var rawNdvi = meanDict.get("NDVI");
        var scaledNdvi = ee.Number(rawNdvi).multiply(0.0001);
        
        // Возвращаем Feature (без геометрии) с полями date и ndvi
        return ee.Feature(null, {
          date: image.date().format("yyyy-MM-dd"),
          ndvi: scaledNdvi
        });
      };
      
      // Применяем addMeanNdvi для каждого снимка коллекции
      var withNdvi = collection.map(addMeanNdvi);
      
      // Преобразуем FeatureCollection в список (List)
      var resultList = withNdvi.toList(withNdvi.size());
      
      // Возвращаем результат (Earth Engine вернёт JSON со структурой List)
      resultList;
    `;

    const requestData = {
      script,
    };

    console.log("🔗 Запрос к GEE (evalscript):", geeUrl);
    console.log("📡 JSON:", JSON.stringify(requestData, null, 2));

    // 4) Делаем POST-запрос к :evalscript
    const response = await axios.post(geeUrl, requestData, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    // 5) Ответ придёт в формате EvaluateResponse
    //    Обычно: { name, state, results: { json: { type: 'List', value: [...] } } }
    console.log("✅ Результат GEE (NDVI Time Series):", response.data);

    if (!response.data.results || !response.data.results.json) {
      return res.status(500).json({
        error: "Не удалось получить JSON из GEE (results.json пуст).",
        rawResponse: response.data
      });
    }

    // 6) Возвращаем клиенту содержимое results.json
    //    Здесь лежит "type": "List", "value": [ {type: 'Feature', properties: {...}} , ... ]
    res.json({ ndviTimeSeries: response.data.results.json });
  } catch (error) {
    console.error(
      "❌ Ошибка при получении NDVI-временного ряда:",
      error.response?.data || error.message
    );
    res.status(500).json({
      error: "Ошибка при получении NDVI-временного ряда",
      details: error.response?.data || error.message,
    });
  }
});

module.exports = router;
