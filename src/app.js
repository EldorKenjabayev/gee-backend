const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const { errorHandler } = require("./middleware/errorHandler");
const attachUser = require("./middleware/attachUser");
const setupSwagger = require("./config/swagger");

require("dotenv").config();
const passport = require("./config/passport");
const authRoutes = require("./routes/authRoutes");
const googleAuthRoutes = require("./routes/googleAuthRoutes");
const geeRoutes = require("./routes/geeRoutes");
const ndviRoutes = require("./routes/ndviRoutes");
const feedbackRoutes = require("./routes/feedbackRoutes");
const waterRoutes = require("./routes/waterIndexRoutes");
const app = express();
setupSwagger(app);

app.use(cors());
app.use(morgan("dev"));
app.use(express.json());
app.use(passport.initialize());

app.use(attachUser);

// Маршруты
app.use("/api/auth", authRoutes);
app.use("/api/auth/google", googleAuthRoutes);
app.use("/api/gee", geeRoutes);
app.use("/api/ndvi", ndviRoutes);
app.use("/api/ndwi", waterRoutes );
app.use("/api/feedback", feedbackRoutes);

app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Сервер запущен: http://localhost:${PORT}`));
