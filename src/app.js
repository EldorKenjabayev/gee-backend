const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
require("dotenv").config();
const passport = require("./middleware/passport");
const authRoutes = require("./routes/authRoutes");
const googleAuthRoutes = require("./routes/googleAuthRoutes");
const geeRoutes = require("./routes/geeRoutes");
const ndviRoutes = require("./routes/ndviRoutes");
const setupSwagger = require("./config/swagger");
const feedbackRoutes = require("./routes/feedbackRoutes");

const app = express();

// Настройка Swagger
setupSwagger(app);

// Middleware
app.use(cors());
app.use(morgan("dev"));
app.use(express.json());
app.use(passport.initialize());

// ✅ Исправляем маршруты
app.use("/api/auth", authRoutes);
app.use("/api/auth/google", googleAuthRoutes); // Было неправильно

app.use("/api/gee", geeRoutes);
app.use("/api/ndvi", ndviRoutes);
app.use("/api/feedback", feedbackRoutes);

// Проверка работы сервера
app.get("/", (req, res) => {
  res.json({ message: "🚀 API работает! Используй /api/docs для документации." });
});

// Запуск сервера
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Сервер запущен: http://localhost:${PORT}`);
});
