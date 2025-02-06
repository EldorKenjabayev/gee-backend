const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const { exec } = require("child_process");
const db = require("../config/db");
const { refreshAccessToken } = require("../middleware/refreshToken");

const router = express.Router();

/**
 * @swagger
 * /api/gee/data:
 *   get:
 *     summary: Получить сохраненные данные GEE
 *     tags: [GEE]
 *     security:
 *       - BearerAuth: []
 *     description: Возвращает список всех данных, сохранённых в базе.
 *     responses:
 *       200:
 *         description: Список данных
 */
router.get("/data", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const data = await db.any("SELECT * FROM gee_data WHERE user_id = $1", [userId]);
    res.json(data);
  } catch (error) {
    console.error("Ошибка при получении данных GEE:", error);
    res.status(500).json({ error: "Ошибка при получении данных GEE" });
  }
});

/**
 * @swagger
 * /api/gee/data:
 *   post:
 *     summary: Запросить данные GEE (NDVI, вода, снежный покров)
 *     tags: [GEE]
 *     security:
 *       - BearerAuth: []
 *     description: Вызывает Google Earth Engine для загрузки данных.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               region:
 *                 type: object
 *                 example: { "coordinates": [[59, 37], [72, 37], [72, 45], [59, 45], [59, 37]] }
 *               startDate:
 *                 type: string
 *                 example: "2020-01-01"
 *               endDate:
 *                 type: string
 *                 example: "2024-01-01"
 *               type:
 *                 type: string
 *                 example: "NDVI"
 *     responses:
 *       200:
 *         description: Данные успешно получены и сохранены
 */
router.post("/data", authMiddleware, async (req, res) => {
  try {
    const { region, startDate, endDate, type } = req.body;
    const userId = req.user.id;

    if (!region || !startDate || !endDate || !type) {
      return res.status(400).json({ error: "Все параметры обязательны" });
    }

    let user = await db.one("SELECT google_access_token, google_refresh_token FROM users WHERE id = $1", [userId]);
    let accessToken = user.google_access_token;

    // 🔄 Если Access Token пуст, пробуем обновить через refresh_token
    if (!accessToken) {
      console.log("🔄 Access Token отсутствует! Пробуем обновить...");
      accessToken = await refreshAccessToken(user);

      if (!accessToken) {
        console.error("❌ Ошибка обновления Access Token. Повторите вход.");
        return res.status(401).json({ error: "Ошибка обновления Access Token. Повторите вход." });
      }

      console.log("✅ Новый Access Token успешно обновлен!");
    }


    // Формируем команду для вызова GEE
    const command = `earthengine run src/scripts/fetchData.js '${JSON.stringify(region)}' ${startDate} ${endDate} ${type}`;

    exec(command, async (error, stdout, stderr) => {
      if (error) {
        console.error(`Ошибка выполнения GEE: ${stderr}`);
        return res.status(500).json({ error: "Ошибка получения данных" });
      }

      const geeData = stdout.trim();
      console.log("GEE Output:", geeData);

      const result = await db.one(
        "INSERT INTO gee_data (user_id, type, start_date, end_date, data) VALUES ($1, $2, $3, $4, $5) RETURNING *",
        [userId, type, startDate, endDate, geeData]
      );

      res.json(result);
    });
  } catch (error) {
    console.error("Ошибка при обработке запроса:", error);
    res.status(500).json({ error: "Ошибка при обработке запроса" });
  }
});

/**
 * @swagger
 * /api/gee/data/{id}:
 *   get:
 *     summary: Получить конкретный набор данных GEE
 *     tags: [GEE]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID данных
 *     responses:
 *       200:
 *         description: Данные GEE
 */
router.get("/data/:id", authMiddleware, async (req, res) => {
  try {
    const data = await db.oneOrNone("SELECT * FROM gee_data WHERE id = $1 AND user_id = $2", [
      req.params.id,
      req.user.id,
    ]);

    if (!data) {
      return res.status(404).json({ error: "Данные не найдены" });
    }

    res.json(data);
  } catch (error) {
    console.error("Ошибка при получении данных:", error);
    res.status(500).json({ error: "Ошибка при получении данных" });
  }
});

module.exports = router;
