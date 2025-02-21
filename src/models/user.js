const db = require("../config/db");
const bcrypt = require("bcryptjs");

class User {
    static async create(email, password, googleId = null) {
        const hashedPassword = password ? await bcrypt.hash(password, 10) : null;
        return db.one(
            "INSERT INTO users (email, password_hash, google_id) VALUES ($1, $2, $3) RETURNING *",
            [email, hashedPassword, googleId]
        );
    }
    static async findByEmail(email) {
        return db.oneOrNone("SELECT * FROM users WHERE email = $1", [email]);
    }

    static async findById(id) {
        return db.oneOrNone("SELECT * FROM users WHERE id = $1", [id]);
    }

    static async comparePassword(password, hash) {
        return bcrypt.compare(password, hash);
    }

    static async saveToken(userId, token) {
        return db.none("UPDATE users SET token = $1 WHERE id = $2", [token, userId]);
    }
}

module.exports = User;
