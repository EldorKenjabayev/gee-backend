const express = require("express");
const { register, login } = require("../controllers/authController");

const router = express.Router();

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Регистрация пользователя
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 example: "user@example.com"
 *               password:
 *                 type: string
 *                 example: "password123"
 *     responses:
 *       201:
 *         description: Успешная регистрация
 *       400:
 *         description: Пользователь уже существует
 */
router.post("/register", register);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Авторизация пользователя
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 example: "user@example.com"
 *               password:
 *                 type: string
 *                 example: "password123"
 *     responses:
 *       200:
 *         description: Успешный вход
 *       401:
 *         description: Неверные учетные данные
 */
router.post("/login", login);
const authMiddleware = require("../middleware/authMiddleware");

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Проверка авторизации
 *     tags: [Auth]
 *     security:
 *       - BearerAuth: []
 *     description: Возвращает данные авторизованного пользователя, если токен верный.
 *     responses:
 *       "200":
 *         description: Успешная проверка авторизации
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     email:
 *                       type: string
 *                       example: "user@example.com"
 *       "401":
 *         description: Неавторизованный (токен отсутствует или неверный)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Токен отсутствует или недействителен"
 */
router.get("/me", authMiddleware, (req, res) => {
    res.json({ user: req.user });
  });

module.exports = router;
