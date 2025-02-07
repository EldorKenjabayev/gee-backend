const Redis = require("ioredis");

const redis = new Redis({
  host: "localhost", // IP сервера Redis
  port: 6379,
  retryStrategy: (times) => Math.min(times * 50, 2000), // Попытки переподключения
});

redis.on("connect", () => console.log("🔥 Redis подключен!"));
redis.on("error", (err) => console.error("❌ Ошибка Redis:", err));

module.exports = redis;
