const User = require("../models/user");
const jwt = require("jsonwebtoken");

const generateToken = (user) => {
    return jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: "1h" });
};

exports.register = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ message: "Email and password required" });

        const existingUser = await User.findByEmail(email);
        if (existingUser) return res.status(400).json({ message: "User already exists" });

        const newUser = await User.create(email, password);
        const token = generateToken(newUser);

        res.status(201).json({ token, user: { id: newUser.id, email: newUser.email } });
    } catch (error) {
        res.status(500).json({ message: "Error registering user", error });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ message: "Email and password required" });

        const user = await User.findByEmail(email);
        if (!user) return res.status(401).json({ message: "Invalid credentials" });

        const isMatch = await User.comparePassword(password, user.password_hash);
        if (!isMatch) return res.status(401).json({ message: "Invalid credentials" });

        const token = generateToken(user);
        res.status(200).json({ token, user: { id: user.id, email: user.email } });
    } catch (error) {
        res.status(500).json({ message: "Error logging in", error });
    }
};
