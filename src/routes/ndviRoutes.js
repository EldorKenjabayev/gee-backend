const express = require("express");
const ee = require("@google/earthengine");
const authMiddleware = require("../middleware/authMiddleware");
const privateKey = require("./my-earth-engine-app-e2e73b5596d4.json");

const router = express.Router();

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


router.post("/ndvi-graph-series", authMiddleware, async (req, res) => {
  if (!eeInitialized) {
    return res.status(500).json({ error: "Earth Engine не инициализирован" });
  }

  try {
    const { startYear, endYear, polygon, aggregation } = req.body;

    // Валидация параметров
    if (!startYear || !endYear || !polygon?.coordinates) {
      return res.status(400).json({ error: "Неверные параметры запроса" });
    }

    const coordinates = Array.isArray(polygon.coordinates[0][0]) 
      ? polygon.coordinates[0] 
      : polygon.coordinates;

    if (coordinates.length < 3) {
      return res.status(400).json({ error: "Некорректный формат полигона" });
    }

    const region = ee.Geometry.Polygon(coordinates);

    // Получение коллекции изображений
    const collection = ee.ImageCollection("MODIS/006/MOD13A1")
      .filterBounds(region)
      .filterDate(`${startYear}-01-01`, `${endYear}-12-31`)
      .select("NDVI");

    // Агрегация данных
    let processedCollection = collection;
    if (aggregation === 'monthly') {
      processedCollection = processedCollection
        .map(image => image.set('month', image.date().get('month')))
        .sort('system:time_start');
    }

    // Обработка изображений
    const timeSeries = processedCollection.map(image => {
      const meanNDVI = image.reduceRegion({
        reducer: ee.Reducer.mean(),
        geometry: region,
        scale: 5000,
        bestEffort: true
      });
      
      return ee.Feature(null, {
        "date": image.date().format("YYYY-MM-dd"),
        "NDVI": meanNDVI.get("NDVI")
      });
    });

    // Получение данных
    const result = await timeSeries.reduceColumns({
      reducer: ee.Reducer.toList(2),
      selectors: ['date', 'NDVI']
    }).get('list');

    const formatted = result.getInfo()
      .map(([date, ndvi]) => ({
        date: date.replace(/T.*/, ''),
        ndvi: ndvi ? parseFloat((ndvi * 0.0001).toFixed(4)) : null
      }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    res.json({ 
      ndviTimeSeries: formatted,
      stats: {
        min: Math.min(...formatted.filter(f => f.ndvi).map(f => f.ndvi)),
        max: Math.max(...formatted.filter(f => f.ndvi).map(f => f.ndvi)),
        avg: formatted.filter(f => f.ndvi).reduce((a, b) => a + b.ndvi, 0) / formatted.length
      }
    });

  } catch (error) {
    console.error("❌ Ошибка получения NDVI:", error);
    res.status(500).json({
      error: "Ошибка обработки запроса",
      details: error.message
    });
  }
});

/**
 * @swagger
 * /api/ndvi/time-series:
 *   post:
 *     summary: Получить временной ряд NDVI для региона
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
 *                 example: 2023
 *               polygon:
 *                 type: object
 *                 properties:
 *                   coordinates:
 *                     type: array
 *                     items:
 *                       type: array
 *                       items: number
 *                 example: 
 *                   coordinates: [[59.1,37.5],[72.3,37.5],[72.3,45.9],[59.1,45.9],[59.1,37.5]]
 *               aggregation:
 *                 type: string
 *                 enum: [daily, monthly]
 *                 default: daily
 *     responses:
 *       200:
 *         description: Данные для построения графика
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ndviTimeSeries:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       date:
 *                         type: string
 *                         format: date
 *                       ndvi:
 *                         type: number
 *                         nullable: true
 *                 stats:
 *                   type: object
 *                   properties:
 *                     min:
 *                       type: number
 *                     max:
 *                       type: number
 *                     avg:
 *                       type: number
 */

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

module.exports = router;