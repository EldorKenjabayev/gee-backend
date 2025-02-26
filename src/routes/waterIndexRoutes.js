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

router.post("/water-index-series", authMiddleware, async (req, res) => {
  if (!eeInitialized) {
    return res.status(500).json({ error: "Earth Engine не инициализирован" });
  }

  try {
    const { startYear, endYear, polygon, aggregation, indexType = 'NDWI' } = req.body;

    if (!startYear || !endYear || !polygon?.coordinates) {
      return res.status(400).json({ error: "Неверные параметры запроса" });
    }

    const coordinates = Array.isArray(polygon.coordinates[0][0]) 
      ? polygon.coordinates[0] 
      : polygon.coordinates;

    const region = ee.Geometry.Polygon(coordinates);

    // Используем Sentinel-2 для лучшего разрешения
    const collection = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
      .filterBounds(region)
      .filterDate(`${startYear}-01-01`, `${endYear}-12-31`)
      .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 20))
      .map(image => {
        // NDWI = (Green - NIR) / (Green + NIR)
        const ndwi = image.normalizedDifference(['B3', 'B8']).rename('NDWI');
        
        // MNDWI = (Green - SWIR) / (Green + SWIR)
        const mndwi = image.normalizedDifference(['B3', 'B11']).rename('MNDWI');
        
        return image.addBands(ndwi).addBands(mndwi)
          .set('system:time_start', image.get('system:time_start'));
      });

    // Выбираем индекс на основе параметра indexType
    const indexBand = indexType === 'MNDWI' ? 'MNDWI' : 'NDWI';

    const timeSeries = collection.map(image => {
      const meanIndex = image.select(indexBand).reduceRegion({
        reducer: ee.Reducer.mean(),
        geometry: region,
        scale: 20,
        maxPixels: 1e9
      });

      // Рассчитываем площадь водных объектов (где индекс > 0)
      const waterArea = image.select(indexBand).gt(0).multiply(ee.Image.pixelArea())
        .reduceRegion({
          reducer: ee.Reducer.sum(),
          geometry: region,
          scale: 20,
          maxPixels: 1e9
        });

      return ee.Feature(null, {
        date: image.date().format("YYYY-MM-dd"),
        waterIndex: meanIndex.get(indexBand),
        waterArea: waterArea.get(indexBand)
      });
    });

    const result = await timeSeries.reduceColumns({
      reducer: ee.Reducer.toList(3),
      selectors: ['date', 'waterIndex', 'waterArea']
    }).get('list');

    const formatted = result.getInfo()
      .map(([date, waterIndex, waterArea]) => ({
        date: date.replace(/T.*/, ''),
        waterIndex: waterIndex ? parseFloat(waterIndex.toFixed(4)) : null,
        waterAreaHa: waterArea ? parseFloat((waterArea / 10000).toFixed(2)) : null // Конвертируем м² в га
      }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    res.json({ 
      waterTimeSeries: formatted,
      stats: {
        minIndex: Math.min(...formatted.filter(f => f.waterIndex).map(f => f.waterIndex)),
        maxIndex: Math.max(...formatted.filter(f => f.waterIndex).map(f => f.waterIndex)),
        avgIndex: formatted.filter(f => f.waterIndex).reduce((a, b) => a + b.waterIndex, 0) / 
                 formatted.filter(f => f.waterIndex).length,
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

router.post("/water-map", authMiddleware, async (req, res) => {
  if (!eeInitialized) {
    return res.status(500).json({ error: "Earth Engine не инициализирован" });
  }

  try {
    const { startYear, endYear, polygon, indexType = 'NDWI' } = req.body;
    
    if (!startYear || !endYear || !polygon?.coordinates) {
      return res.status(400).json({ error: "Неверные параметры запроса" });
    }

    const regionCoords = polygon.coordinates[0];
    const region = ee.Geometry.Polygon(regionCoords);

    const collection = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
      .filterBounds(region)
      .filterDate(`${startYear}-01-01`, `${endYear}-12-31`)
      .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 20))
      .map(image => {
        const ndwi = image.normalizedDifference(['B3', 'B8']).rename('NDWI');
        const mndwi = image.normalizedDifference(['B3', 'B11']).rename('MNDWI');
        return image.addBands(ndwi).addBands(mndwi);
      });

    const indexBand = indexType === 'MNDWI' ? 'MNDWI' : 'NDWI';
    const meanWaterImage = collection.select(indexBand).mean().clip(region);

    const visParams = {
      min: -1,
      max: 1,
      palette: [
        '#d73027', '#f46d43', '#fdae61', '#fee090', '#ffffbf',
        '#e0f3f8', '#abd9e9', '#74add1', '#4575b4'
      ],
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