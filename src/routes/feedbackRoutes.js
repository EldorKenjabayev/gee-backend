const express = require("express");
const { sendFeedback } = require("../controllers/feedbackController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

/**
 * @swagger
 * /api/feedback:
 *   post:
 *     summary: Отправить обратную связь
 *     tags: [Feedback]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Иван Иванов"
 *               email:
 *                 type: string
 *                 example: "ivan@example.com"
 *               topic:
 *                 type: string
 *                 example: "Поддержка"
 *               message:
 *                 type: string
 *                 example: "Ваше сообщение"
 *     responses:
 *       201:
 *         description: Обратная связь успешно отправлена
 *       400:
 *         description: Ошибка валидации
 *       500:
 *         description: Ошибка сервера
 */
router.post("/", authMiddleware, sendFeedback);

module.exports = router; 