const express = require("express");
const ee = require("@google/earthengine");
const authMiddleware = require("../middleware/authMiddleware");
const privateKey = require("./my-earth-engine-app-bfcb38819f13.json");

const router = express.Router();

// Инициализация Earth Engine
let eeInitialized = false;

async function initializeEarthEngine() {
  try {
    await ee.data.authenticateViaPrivateKey(privateKey);
    await new Promise((resolve, reject) => {
      ee.initialize(null, null,
        () => {
          console.log("✅ Earth Engine инициализирован");
          eeInitialized = true;
          resolve();
        },
        (error) => reject(error)
      );
    });
  } catch (error) {
    console.error("❌ Ошибка инициализации Earth Engine:", error);
    process.exit(1);
  }
}

initializeEarthEngine();

// Эндпоинт для временного ряда NDVI
router.post("/ndvi-time-series", authMiddleware, async (req, res) => {
  if (!eeInitialized) {
    return res.status(500).json({ error: "Earth Engine не инициализирован" });
  }

  try {
    const { startYear, endYear, polygon } = req.body;

    if (!startYear || !endYear || !polygon?.coordinates) {
      return res.status(400).json({ error: "Неверные параметры запроса" });
    }

    if (!Array.isArray(polygon.coordinates) || polygon.coordinates.length < 3) {
      return res.status(400).json({ error: "Некорректный формат полигона" });
    }

    const region = ee.Geometry.Polygon(polygon.coordinates);

    const collection = ee.ImageCollection("MODIS/006/MOD13A1")
      .filterBounds(region)
      .filterDate(`${startYear}-01-01`, `${endYear}-12-31`)
      .select("NDVI");

    const timeSeries = collection.map(image => {
      const meanNDVI = image.reduceRegion({
        reducer: ee.Reducer.mean(),
        geometry: region,
        scale: 5000,
        bestEffort: true
      });
      return ee.Feature(null, {
        "system:time_start": image.get("system:time_start"),
        "NDVI": meanNDVI.get("NDVI")
      });
    });

    timeSeries.evaluate((result, error) => {
      if (error) {
        console.error("❌ Ошибка при обработке NDVI:", error);
        return res.status(500).json({
          error: "Ошибка обработки запроса",
          details: error.message
        });
      }

      if (!result || !Array.isArray(result) || result.length < 1) {
        console.warn("⚠️ Earth Engine вернул пустой массив.");
        return res.status(404).json({ error: "Данные NDVI не найдены." });
      }

      const formatted = result.map(row => ({
        date: new Date(row["system:time_start"]).toISOString().split('T')[0],
        ndvi: row.NDVI ? row.NDVI * 0.0001 : null
      }));

      res.json({ ndviTimeSeries: formatted });
    });

  } catch (error) {
    console.error("❌ Ошибка получения NDVI:", error.message);
    if (!res.headersSent) {
      res.status(500).json({
        error: "Ошибка обработки запроса",
        details: error.message
      });
    }
  }
});

// Эндпоинт для получения карты NDVI (обновленная версия)
router.post("/ndvi-map", authMiddleware, async (req, res) => {
  if (!eeInitialized) {
    return res.status(500).json({ error: "Earth Engine не инициализирован" });
  }

  try {
    const { startYear, endYear, polygon } = req.body;
    
    if (!startYear || !endYear || !polygon?.coordinates) {
      return res.status(400).json({ error: "Неверные параметры запроса" });
    }

    if (!Array.isArray(polygon.coordinates) || 
        polygon.coordinates.length === 0 ||
        !Array.isArray(polygon.coordinates[0]) || 
        polygon.coordinates[0].length < 3) {
      return res.status(400).json({ error: "Некорректный формат полигона" });
    }

    const regionCoords = polygon.coordinates[0];
    const region = ee.Geometry.Polygon(regionCoords);

    const ndviCollection = ee.ImageCollection("MODIS/006/MOD13A1")
      .filterBounds(region)
      .filter(ee.Filter.calendarRange(parseInt(startYear), parseInt(endYear), 'year'))
      .select("NDVI");

    const meanNDVIImage = ndviCollection.mean().multiply(0.0001).clip(region);

    const visParams = {
      min: 0,
      max: 0.8,
      palette: [
        'FFFFFF', 'CE7E45', 'DF923D', 'F1B555', 'FCD163', '99B718', '74A901',
        '66A000', '529400', '3E8601', '207401', '056201', '004C00', '023B01',
        '012E01', '011D01', '011301'
      ],
      dimensions: 1024,
      format: 'png',
      region: region
    };

    const mapURL = await new Promise((resolve, reject) => {
      meanNDVIImage.getThumbURL(visParams, (url, error) => {
        error ? reject(error) : resolve(url);
      });
    });

    res.json({ 
      mapUrl: mapURL,
      bounds: regionCoords
    });

  } catch (error) {
    console.error("❌ Ошибка получения карты NDVI:", error.message);
    res.status(500).json({
      error: "Ошибка обработки запроса",
      details: error.message
    });
  }
});

/**
 * @swagger
 * /api/ndvi/dynamic-map:
 *   post:
 *     summary: Получить NDVI карту для произвольного региона
 *     tags: [NDVI]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               startYear:
 *                 type: integer
 *                 example: 2020
 *               endYear:
 *                 type: integer
 *                 example: 2024
 *               polygon:
 *                 type: object
 *                 properties:
 *                   coordinates:
 *                     type: array
 *                     items:
 *                       type: array
 *                       items: number
 *                 example: 
 *                   coordinates: [[59,37],[72,37],[72,45],[59,45],[59,37]]
 *     responses:
 *       200:
 *         description: URL карты NDVI
 */
router.post("/dynamic-map", authMiddleware, async (req, res) => {
  if (!eeInitialized) {
    return res.status(500).json({ error: "Earth Engine не инициализирован" });
  }

  try {
    const { startYear, endYear, polygon } = req.body;
    
    if (!startYear || !endYear || !polygon?.coordinates) {
      return res.status(400).json({ error: "Неверные параметры запроса" });
    }

    const region = ee.Geometry.Polygon(polygon.coordinates);

    const ndviCollection = ee.ImageCollection("MODIS/006/MOD13A1")
      .filterBounds(region)
      .filter(ee.Filter.calendarRange(startYear, endYear, 'year'))
      .select("NDVI");

    const meanNDVIImage = ndviCollection.mean()
      .multiply(0.0001)
      .clip(region);

    const visParams = {
      min: 0,
      max: 0.8,
      palette: [
        'FFFFFF', 'CE7E45', 'DF923D', 'F1B555', 'FCD163', '99B718', '74A901',
        '66A000', '529400', '3E8601', '207401', '056201', '004C00', '023B01',
        '012E01', '011D01', '011301'
      ],
      dimensions: 1024,
      format: 'png',
      region: region
    };

    const mapURL = await new Promise((resolve, reject) => {
      meanNDVIImage.getThumbURL(visParams, (url, error) => {
        error ? reject(error) : resolve(url);
      });
    });

    res.json({ 
      mapUrl: mapURL,
      bounds: polygon.coordinates[0] // Первый полигон для границ карты
    });
    
  } catch (error) {
    console.error("❌ Ошибка получения карты:", error);
    res.status(500).json({
      error: "Ошибка обработки запроса",
      details: error.message
    });
  }
});

module.exports = router;
