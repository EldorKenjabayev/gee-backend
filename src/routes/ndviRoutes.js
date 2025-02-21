const express = require("express");
const { GoogleAuth } = require("google-auth-library");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

// Настройка Google Auth с использованием сервисного аккаунта
const auth = new GoogleAuth({
  keyFile: "./my-earth-engine-app-197fbcfcb72a.json",
  scopes: ["https://www.googleapis.com/auth/earthengine.readonly"],
});

// Эндпоинт для получения временного ряда NDVI (через eval:evalscript)
router.post("/ndvi-time-series", authMiddleware, async (req, res) => {
  console.log("🔥 NDVI Time Series API: запрос получен!");
  console.log("📌 Параметры запроса:", req.body);

  try {
    const client = await auth.getClient();
    const url = `https://earthengine.googleapis.com/v1/projects/${process.env.GEE_PROJECT}:run`;

    const { startYear, endYear, polygon } = req.body;

    const script = `
      var region = ee.Geometry.Polygon(${JSON.stringify(polygon)});
      var collection = ee.ImageCollection("MODIS/006/MOD13A1")
        .filterBounds(region)
        .filterDate("${startYear}-01-01", "${endYear}-12-31")
        .select("NDVI");
      var addMeanNdvi = function(image) {
        var meanDict = image.reduceRegion({
          reducer: ee.Reducer.mean(),
          geometry: region,
          scale: 250
        });
        var rawNdvi = meanDict.get("NDVI");
        var scaledNdvi = ee.Number(rawNdvi).multiply(0.0001);
        return ee.Feature(null, {
          date: image.date().format("yyyy-MM-dd"),
          ndvi: scaledNdvi
        });
      };
      var withNdvi = collection.map(addMeanNdvi);
      var resultList = withNdvi.toList(withNdvi.size());
      resultList;
    `;

    const response = await client.request({
      url,
      method: "POST",
      data: { script },
    });

    res.json({ ndviTimeSeries: response.data.results.json });
  } catch (error) {
    console.error("Ошибка при получении NDVI-временного ряда:", error);
    res.status(500).json({ error: "Ошибка при получении NDVI-временного ряда" });
  }
});

module.exports = router;
