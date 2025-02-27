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

router.post("/ndwi-graph-series", authMiddleware, async (req, res) => {
  if (!eeInitialized) {
    return res.status(500).json({ error: "Earth Engine не инициализирован" });
  }

  try {
    const { startYear, endYear, polygon, indexType = 'NDWI' } = req.body;

    if (!startYear || !endYear || !polygon?.coordinates) {
      return res.status(400).json({ error: "Неверные параметры запроса" });
    }

    const coordinates = Array.isArray(polygon.coordinates[0][0]) 
      ? polygon.coordinates[0] 
      : polygon.coordinates;

    const region = ee.Geometry.Polygon(coordinates);

    const collection = ee.ImageCollection('JRC/GSW1_4/MonthlyHistory')
      .filterBounds(region)
      .filter(ee.Filter.calendarRange(startYear, endYear, 'year'))
      .map(image => {
        const date = ee.Date(image.get('system:time_start')).format('YYYY-MM');
        return image.set('date', date);
      });

    const timeSeries = collection.map(image => {
      const waterArea = image.select('water').eq(2).multiply(ee.Image.pixelArea())
        .reduceRegion({
          reducer: ee.Reducer.sum(),
          geometry: region,
          scale: 30,
          maxPixels: 1e8,
          bestEffort: true
        });

      return ee.Feature(null, {
        date: image.get('date'),
        waterArea: waterArea.get('water')
      });
    });

    const result = await timeSeries.reduceColumns({
      reducer: ee.Reducer.toList(2),
      selectors: ['date', 'waterArea']
    }).get('list');

    const formatted = result.getInfo()
      .map(([date, waterArea]) => ({
        date: date,
        waterAreaHa: waterArea ? parseFloat((waterArea / 10000).toFixed(2)) : null
      }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    res.json({ 
      waterTimeSeries: formatted,
      stats: {
        minAreaHa: Math.min(...formatted.filter(f => f.waterAreaHa).map(f => f.waterAreaHa)),
        maxAreaHa: Math.max(...formatted.filter(f => f.waterAreaHa).map(f => f.waterAreaHa)),
        avgAreaHa: formatted.filter(f => f.waterAreaHa).reduce((a, b) => a + b.waterAreaHa, 0) / 
                  formatted.filter(f => f.waterAreaHa).length
      }
    });

  } catch (error) {
    console.error("❌ Ошибка получения водного индекса:", error);
    res.status(500).json({
      error: "Ошибка обработки запроса",
      details: error.message
    });
  }
});

router.post("/ndwi-map", authMiddleware, async (req, res) => {
  if (!eeInitialized) {
    return res.status(500).json({ error: "Earth Engine не инициализирован" });
  }

  try {
    const { startYear, endYear, polygon } = req.body;
    
    if (!startYear || !endYear || !polygon?.coordinates) {
      return res.status(400).json({ error: "Неверные параметры запроса" });
    }

    const regionCoords = polygon.coordinates[0];
    const region = ee.Geometry.Polygon(regionCoords);

    const collection = ee.ImageCollection('JRC/GSW1_4/MonthlyHistory')
      .filterBounds(region)
      .filter(ee.Filter.calendarRange(startYear, endYear, 'year'));

    const meanWaterImage = collection.select('water').mean().clip(region);

    const visParams = {
      min: 0.0,
      max: 2.0,
      palette: ['8B4513', 'FFFF00', '00FF00', '00FFFF', '0000FF'],
      dimensions: 1024,
      format: 'png'
    };

    const mapURL = await new Promise((resolve, reject) => {
      meanWaterImage.getThumbURL(visParams, (url, error) => {
        error ? reject(error) : resolve(url);
      });
    });

    res.json({ 
      mapUrl: mapURL,
      bounds: regionCoords
    });

  } catch (error) {
    console.error("❌ Ошибка получения карты водного индекса:", error);
    res.status(500).json({
      error: "Ошибка обработки запроса",
      details: error.message
    });
  }
});

module.exports = router;