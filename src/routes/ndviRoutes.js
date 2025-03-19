const express = require("express");
const ee = require("@google/earthengine");
const authMiddleware = require("../middleware/authMiddleware");
const privateKey = require("./my-earth-engine-app-e2e73b5596d4 (2).json");

const router = express.Router();
let eeInitialized = false;

// Инициализация Google Earth Engine
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

// Функция для маскировки облаков
const cloudMaskS2 = image => {
  const qa = image.select('QA60');
  const cloudBitMask = 1 << 10;
  const cirrusBitMask = 1 << 11;
  const mask = qa.bitwiseAnd(cloudBitMask).eq(0)
    .and(qa.bitwiseAnd(cirrusBitMask).eq(0));
  return image.updateMask(mask);
};

// Функция расчёта NDVI с установкой `system:time_start`
const calculateNDVI = image => {
  return image
    .addBands(image.normalizedDifference(['B8', 'B4']).rename('NDVI'))
    .set('system:time_start', image.date().millis()); // Устанавливаем дату
};

// **Эндпоинт для получения временного ряда NDVI**

router.post("/ndvi-graph-series", authMiddleware, async (req, res) => {
  if (!eeInitialized) {
    return res.status(500).json({ error: "Earth Engine не инициализирован" });
  }

  try {
    const { startYear, endYear, polygon, aggregation = 'daily', dataset = 'S2_SR' } = req.body;

    // Валидация входных параметров
    if (!startYear || !endYear || !polygon?.coordinates) {
      return res.status(400).json({ error: "Неверные параметры запроса" });
    }

    const coordinates = Array.isArray(polygon.coordinates[0][0]) 
      ? polygon.coordinates[0] 
      : polygon.coordinates;

    if (coordinates.length < 3) {
      return res.status(400).json({ error: "Некорректный формат полигона" });
    }

    const allowedDatasets = ['S2', 'S2_SR'];
    if (!allowedDatasets.includes(dataset)) {
      return res.status(400).json({ 
        error: "Некорректный параметр dataset",
        allowedValues: allowedDatasets
      });
    }

    const collectionId = dataset === 'S2' 
      ? 'COPERNICUS/S2_HARMONIZED' 
      : 'COPERNICUS/S2_SR_HARMONIZED';

    const region = ee.Geometry.Polygon(coordinates);

    // Формирование коллекции
    let collection = ee.ImageCollection(collectionId)
      .filterBounds(region)
      .filterDate(`${startYear}`, `${endYear}`)
      .map(cloudMaskS2)
      .map(image => image.set('system:time_start', image.date().millis()))
      .map(calculateNDVI)
      .select('NDVI');

    // Проверка количества изображений
    const imageCount = collection.size().getInfo();
    console.log(`📊 Количество изображений в коллекции: ${imageCount}`);

    if (imageCount === 0) {
      return res.status(404).json({ error: "Данные за указанный период отсутствуют" });
    }

    // Агрегация данных (если monthly)
    if (aggregation === 'monthly') {
      collection = ee.ImageCollection.fromImages(
        ee.List.sequence(0, (endYear - startYear) * 12 + 11)
          .map(monthOffset => {
            const start = ee.Date(`${startYear}-01-01`).advance(monthOffset, 'month');
            const end = start.advance(1, 'month');
            return collection
              .filterDate(start, end)
              .median()
              .set('system:time_start', start.millis());
          })
      ).filter(ee.Filter.notNull(['NDVI']));
    }

    // Формирование временного ряда
    const timeSeries = collection.map(image => {
      const meanNDVI = image.reduceRegion({
        reducer: ee.Reducer.mean(),
        geometry: region,
        scale: 10,
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

    // Форматирование результата
    const formatted = result.getInfo()
      .map(([date, ndvi]) => ({
        date: date.replace(/T.*/, ''),
        ndvi: ndvi ? parseFloat(ndvi.toFixed(4)) : null
      }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    // 🔹 Вычисляем min, max, avg
    const ndviValues = formatted.map(item => item.ndvi).filter(v => v !== null);
    const minNDVI = Math.min(...ndviValues);
    const maxNDVI = Math.max(...ndviValues);
    const avgNDVI = ndviValues.reduce((sum, v) => sum + v, 0) / ndviValues.length;

    res.json({
      ndviTimeSeries: formatted,
      stats: {
        min: minNDVI,
        max: maxNDVI,
        avg: avgNDVI
      },
      metadata: {
        collection: collectionId,
        aggregation: aggregation,
        area: coordinates
      }
    });

  } catch (error) {
    console.error("❌ Ошибка получения NDVI:", error);
    res.status(500).json({
      error: "Ошибка обработки запроса",
      details: error.message.replace(/Error: /, '')
    });
  }
});




// Обновленная Swagger документация
/**
 * @swagger
 * /api/ndvi/time-series:
 *   post:
 *     summary: Получить временной ряд NDVI для региона (Sentinel-2)
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
 *               dataset:
 *                 type: string
 *                 enum: [S2_SR, S2]
 *                 default: S2_SR
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


router.post("/ndvi-map", authMiddleware, async (req, res) => {
  if (!eeInitialized) {
    return res.status(500).json({ error: "Earth Engine не инициализирован" });
  }

  try {
    const { startDate, endDate, polygon } = req.body; // <-- startYear va endYear ni startDate va endDate ga almashtirdik
    
    if (!startDate || !endDate || !polygon?.coordinates) {
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

    const ndviCollection = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
      .filterBounds(region)
      .filterDate(startDate, endDate) // <-- startYear va endYear o‘rniga startDate va endDate ishlatyapmiz
      .map(cloudMaskS2)
      .map(calculateNDVI)
      .select("NDVI");

    const meanNDVIImage = ndviCollection.mean().clip(region);

    const visParams = {
      min: -0.2,
      max: 1,
      palette: [
        'FFFFFF', 'CE7E45', 'DF923D', 'F1B555', 'FCD163', '99B718', '74A901',
        '66A000', '529400', '3E8601', '207401', '056201', '004C00', '023B01',
        '012E01', '011D01', '011301'
      ]
    };

    const mapURL = await new Promise((resolve, reject) => {
      meanNDVIImage.getThumbURL({ ...visParams, dimensions: 1024, format: 'png', region: region }, 
        (url, error) => error ? reject(error) : resolve(url)
      );
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
 * /api/ndvi/map:
 *   post:
 *     summary: Генерация NDVI карты по данным Sentinel-2
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
 *               startDate:
 *                 type: string
 *                 format: date
 *                 example: "2023-01-01"
 *               endDate:
 *                 type: string
 *                 format: date
 *                 example: "2023-12-31"
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
 *               dataset:
 *                 type: string
 *                 enum: [S2_SR, S2]
 *                 default: S2_SR
 *     responses:
 *       200:
 *         description: URL растровой карты NDVI
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 mapUrl:
 *                   type: string
 *                   description: URL PNG изображения
 *                 bounds:
 *                   type: array
 *                   items: number
 *                 params:
 *                   type: object
 *                   properties:
 *                     dateRange:
 *                       type: string
 *                     dataset:
 *                       type: string
 *                     scale:
 *                       type: string
 */


router.post("/ndvi-graph-series-images", authMiddleware, async (req, res) => {
  if (!eeInitialized) {
    return res.status(500).json({ error: "Earth Engine не инициализирован" });
  }

  try {
    const { startDate, endDate, polygon, dataset = 'S2_SR' } = req.body;

    // Валидация входных параметров
    if (!startDate || !endDate || !polygon?.coordinates) {
      return res.status(400).json({ error: "Неверные параметры запроса" });
    }

    const coordinates = Array.isArray(polygon.coordinates[0][0])
      ? polygon.coordinates[0]
      : polygon.coordinates;

    if (coordinates.length < 3) {
      return res.status(400).json({ error: "Некорректный формат полигона" });
    }

    const allowedDatasets = ['S2', 'S2_SR'];
    if (!allowedDatasets.includes(dataset)) {
      return res.status(400).json({
        error: "Некорректный параметр dataset",
        allowedValues: allowedDatasets
      });
    }

    const collectionId = dataset === 'S2'
      ? 'COPERNICUS/S2_HARMONIZED'
      : 'COPERNICUS/S2_SR_HARMONIZED';

    const region = ee.Geometry.Polygon(coordinates);

    // Формирование коллекции
    let collection = ee.ImageCollection(collectionId)
      .filterBounds(region)
      .filterDate(startDate, endDate)
      .map(cloudMaskS2)
      .map(image => image.set('system:time_start', image.date().millis()))
      .map(calculateNDVI)
      .select('NDVI');

    // Проверка количества изображений
    const imageCount = collection.size().getInfo();
    console.log(`📊 Количество изображений в коллекции: ${imageCount}`);

    if (imageCount === 0) {
      return res.status(404).json({ error: "Данные за указанный период отсутствуют" });
    }

    // Получаем первое и последнее изображения
    const firstImage = ee.Image(collection.first());
    const lastImage = ee.Image(collection.sort('system:time_start', false).first()); // Sort descending

    const getImageUrl = async (image) => {
      const date = image.date().format("YYYY-MM-dd").getInfo();
      const ndvi = image.reduceRegion({
        reducer: ee.Reducer.mean(),
        geometry: region,
        scale: 10,
        bestEffort: true
      }).get("NDVI").getInfo();

      const visParams = {
        min: -0.2,
        max: 1,
        palette: [
          'FFFFFF', 'CE7E45', 'DF923D', 'F1B555', 'FCD163', '99B718', '74A901',
          '66A000', '529400', '3E8601', '207401', '056201', '004C00', '023B01',
          '012E01', '011D01', '011301'
        ]
      };

      const url = image.getThumbURL({
        ...visParams,
        dimensions: 512,
        format: 'png',
        region: region
      });

      return { date: date, ndvi: ndvi, url: url };
    };

    const firstImageInfo = await getImageUrl(firstImage);
    const lastImageInfo = await getImageUrl(lastImage);

    res.json({
      firstImage: firstImageInfo,
      lastImage: lastImageInfo,
      metadata: {
        collection: collectionId,
        area: coordinates
      }
    });

  } catch (error) {
    console.error("❌ Ошибка получения изображений NDVI:", error);
    res.status(500).json({
      error: "Ошибка обработки запроса",
      details: error.message.replace(/Error: /, '')
    });
  }
});

/**
 * @swagger
 * /api/ndvi/graph-series-images:
 *   post:
 *     summary: Получить URL первого и последнего изображений для временного ряда NDVI (Sentinel-2)
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
 *               startDate:
 *                 type: string
 *                 format: date
 *                 example: "2023-01-01"
 *               endDate:
 *                 type: string
 *                 format: date
 *                 example: "2023-12-31"
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
 *               dataset:
 *                 type: string
 *                 enum: [S2_SR, S2]
 *                 default: S2_SR
 *     responses:
 *       200:
 *         description: URL первого и последнего изображений для временного ряда NDVI
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 firstImage:
 *                   type: object
 *                   properties:
 *                     date:
 *                       type: string
 *                       format: date
 *                     ndvi:
 *                       type: number
 *                     url:
 *                       type: string
 *                       format: url
 *                 lastImage:
 *                   type: object
 *                   properties:
 *                     date:
 *                       type: string
 *                       format: date
 *                     ndvi:
 *                       type: number
 *                     url:
 *                       type: string
 *                       format: url
 */
module.exports = router;