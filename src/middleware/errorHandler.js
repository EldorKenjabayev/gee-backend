// errorHandler.js - Централизованный обработчик ошибок

class AppError extends Error {
    constructor(message, statusCode) {
      super(message);
      this.statusCode = statusCode;
      Error.captureStackTrace(this, this.constructor);
    }
  }
  
  const errorHandler = (err, req, res, next) => {
    console.error("🔥 Ошибка:", err.message);
  
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
      error: err.message || "Внутренняя ошибка сервера",
    });
  };
  
  module.exports = { errorHandler, AppError };
  