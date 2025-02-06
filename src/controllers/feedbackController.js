const db = require("../config/db");

exports.sendFeedback = async (req, res) => {
  try {
    const { name, email, topic, message } = req.body;
    if (!name || !email || !topic || !message) {
      return res.status(400).json({ error: "Все поля обязательны" });
    }

    await db.none(
      "INSERT INTO feedback (name, email, topic, message) VALUES ($1, $2, $3, $4)",
      [name, email, topic, message]
    );

    res.status(201).json({ message: "Обратная связь успешно отправлена" });
  } catch (error) {
    console.error("Ошибка при отправке обратной связи:", error);
    res.status(500).json({ error: "Ошибка при отправке обратной связи" });
  }
}; 