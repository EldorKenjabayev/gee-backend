const express = require("express");
const axios = require("axios");
const db = require("../config/db");
const authMiddleware = require("../middleware/authMiddleware");
const redis = require("../config/redis");
const { OAuth2Client } = require("google-auth-library");

const router = express.Router();
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);

router.post("/", authMiddleware, async (req, res) => {
  console.log("🔥 NDVI API so‘rovi qabul qilindi!");
  console.log("📌 Kiritilgan ma'lumotlar:", req.body);

  try {
    const { startYear, endYear, polygon } = req.body;
    const userId = req.user.id;

    let accessToken = await redis.get(`google_access_token:${userId}`);

    if (!accessToken) {
      console.log("🔎 Access Token topilmadi. Baza orqali tekshiryapmiz...");
      let user = await db.one("SELECT google_access_token FROM users WHERE id = $1", [userId]);
      accessToken = user.google_access_token;
    }

    if (!accessToken) {
      return res.status(401).json({ error: "Google Access Token mavjud emas!" });
    }

    console.log("🔑 Foydalanilayotgan Access Token:", accessToken);

    // ✅ TO‘G‘RI API URL
    const geeUrl = `https://earthengine.googleapis.com/v1/projects/${process.env.GEE_PROJECT}/tasks`;

    const requestData = {
      expression: {
        code: `
          var region = ee.Geometry.Polygon(${JSON.stringify(polygon)});
          
          var collection = ee.ImageCollection("MODIS/006/MOD13A1")
            .filterBounds(region)
            .filter(ee.Filter.calendarRange(${startYear}, ${endYear}, 'year'))
            .select('NDVI');
          
          var meanNDVI = collection.mean().multiply(0.0001).clip(region);

          return meanNDVI;
        `,
      },
    };

    console.log("🔗 Google Earth Engine API URL:", geeUrl);
    console.log("📡 JSON so‘rov:", JSON.stringify(requestData, null, 2));

    const response = await axios.post(geeUrl, requestData, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    console.log("✅ Google Earth Engine natijasi:", response.data);
    res.json({ ndvi: response.data });
  } catch (error) {
    console.error("❌ NDVI ma'lumotlarini olishda xatolik:", error.response?.data || error.message);
    res.status(500).json({
      error: "NDVI ma'lumotlarini olishda xatolik",
      details: error.response?.data || error.message,
    });
  }
});

module.exports = router;
