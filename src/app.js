const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const { errorHandler } = require("./middleware/errorHandler");
const attachUser = require("./middleware/attachUser");
const setupSwagger = require("./config/swagger");
const runMigrations = require("./runMigrations"); // Подключаем автоматические миграции

require("dotenv").config();
const passport = require("./config/passport");
const authRoutes = require("./routes/authRoutes");
const googleAuthRoutes = require("./routes/googleAuthRoutes");
const geeRoutes = require("./routes/geeRoutes");
const ndviRoutes = require("./routes/ndviRoutes");
const feedbackRoutes = require("./routes/feedbackRoutes");
const waterRoutes = require("./routes/waterIndexRoutes");
const eviRoutes = require("./routes/eviIndexroutes");

const app = express();
setupSwagger(app);

app.use(cors());
app.use(morgan("dev"));
app.use(express.json());
app.use(passport.initialize());
app.use(attachUser);

// 🚀 **Функция запуска сервера с автоматическими миграциями**
async function startServer() {
  console.log("🚀 Запуск сервера...");

  try {
    await runMigrations(); // 🔄 Автоматически применяем миграции перед запуском сервера
    console.log("✅ Все миграции успешно применены!");
  } catch (error) {
    console.error("❌ Ошибка при выполнении миграций:", error);
    process.exit(1); // ❌ Остановить сервер, если миграции не применились
  }

  // 🔗 Маршруты API
  app.use("/api/auth", authRoutes);
  app.use("/api/auth/google", googleAuthRoutes);
  app.use("/api/gee", geeRoutes);
  app.use("/api/ndvi", ndviRoutes);
  app.use("/api/ndwi", waterRoutes);
  app.use("/api/evi", eviRoutes);
  app.use("/api/feedback", feedbackRoutes);

  app.use(errorHandler);

  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`✅ Сервер запущен: http://localhost:${PORT}`));
}

// 🏁 **Запускаем сервер**
startServer();
