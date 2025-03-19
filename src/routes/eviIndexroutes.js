const express = require("express");
const ee = require("@google/earthengine");
const authMiddleware = require("../middleware/authMiddleware");
const privateKey = require("./my-earth-engine-app-e2e73b5596d4 (2).json");

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

router.post("/evi-graph-series", authMiddleware, async (req, res) => {
    if (!eeInitialized) {
        return res.status(500).json({ error: "Earth Engine не инициализирован" });
    }

    try {
        const { startYear, endYear, polygon } = req.body;
        
        if (!startYear || !endYear || !polygon?.coordinates) {
            return res.status(400).json({ error: "Неверные параметры запроса" });
        }

        const coordinates = Array.isArray(polygon.coordinates[0][0]) 
            ? polygon.coordinates[0] 
            : polygon.coordinates;

        const region = ee.Geometry.Polygon(coordinates);

        const collection = ee.ImageCollection('MODIS/006/MOD13A2')
            .filterBounds(region)
            .filter(ee.Filter.date(startDate, endDate))
            .select('EVI');

        const timeSeries = collection.map(image => {
            const date = ee.Date(image.get('system:time_start')).format('YYYY-MM-dd');
            const eviValue = image.reduceRegion({
                reducer: ee.Reducer.mean(),
                geometry: region,
                scale: 500,
                maxPixels: 1e8
            }).get('EVI');

            return ee.Feature(null, {
                date: date,
                evi: eviValue
            });
        });

        const result = await timeSeries.reduceColumns({
            reducer: ee.Reducer.toList(2),
            selectors: ['date', 'evi']
        }).get('list');

        const formatted = result.getInfo()
            .map(([date, evi]) => ({
                date: date,
                evi: evi ? parseFloat(evi.toFixed(3)) : null
            }))
            .sort((a, b) => new Date(a.date) - new Date(b.date));

        res.json({ 
            eviTimeSeries: formatted,
            stats: {
                minEVI: Math.min(...formatted.filter(f => f.evi).map(f => f.evi)),
                maxEVI: Math.max(...formatted.filter(f => f.evi).map(f => f.evi)),
                avgEVI: formatted.filter(f => f.evi).reduce((a, b) => a + b.evi, 0) / 
                        formatted.filter(f => f.evi).length
            }
        });

    } catch (error) {
        console.error("❌ Ошибка получения EVI:", error);
        res.status(500).json({
            error: "Ошибка обработки запроса",
            details: error.message
        });
    }
});

router.post("/evi-map", authMiddleware, async (req, res) => {
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

        const collection = ee.ImageCollection('MODIS/006/MOD13A2')
            .filterBounds(region)
            .filter(ee.Filter.date(startDate, endDate))
            .select('EVI');

        const meanEviImage = collection.mean().clip(region);

        const visParams = {
            min: 0.0,
            max: 1.0,
            palette: ['#FFFFCC', '#C4E3B2', '#7BC87C', '#238443'],
            dimensions: 1024,
            format: 'png'
        };

        const mapURL = await new Promise((resolve, reject) => {
            meanEviImage.getThumbURL(visParams, (url, error) => {
                error ? reject(error) : resolve(url);
            });
        });

        res.json({ 
            mapUrl: mapURL,
            bounds: regionCoords
        });

    } catch (error) {
        console.error("❌ Ошибка получения карты EVI:", error);
        res.status(500).json({
            error: "Ошибка обработки запроса",
            details: error.message
        });
    }
});

module.exports = router;
