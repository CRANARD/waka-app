// ===============================
// server.js (Fully Integrated with Frontend)
// ===============================

const express = require("express");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcryptjs");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

// ===============================
// Middleware
// ===============================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend files
app.use(express.static("public"));

// Serve uploads folder
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ===============================
// Database Setup
// ===============================
const db = new sqlite3.Database("./database.db", (err) => {
    if (err) console.error("Database error:", err.message);
    else console.log("Connected to SQLite database.");
});

// Users table
db.run(`
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fullname TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
`);

// Tracks table
db.run(`
CREATE TABLE IF NOT EXISTS tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    artist TEXT,
    filename TEXT,
    plays INTEGER DEFAULT 0,
    top_monday INTEGER DEFAULT 0,
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
`);

// ===============================
// File Upload Setup
// ===============================
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadPath = "./uploads";
        if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath);
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

// ===============================
// Routes
// ===============================

// Health Check
app.get("/api/health", (req, res) => {
    res.json({ message: "Server is running 🚀" });
});

// ===============================
// REGISTER
// ===============================
app.post("/register", async (req, res) => {
    const { fullname, email, password } = req.body;
    if (!fullname || !email || !password)
        return res.status(400).json({ message: "All fields are required" });

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const query = `INSERT INTO users (fullname, email, password) VALUES (?, ?, ?)`;

        db.run(query, [fullname, email, hashedPassword], function (err) {
            if (err) {
                if (err.message.includes("UNIQUE"))
                    return res.status(400).json({ message: "Email already exists" });
                return res.status(500).json({ message: "Database error" });
            }
            res.status(201).json({ message: "User registered successfully", userId: this.lastID });
        });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

// ===============================
// LOGIN
// ===============================
app.post("/login", (req, res) => {
    const { email, password } = req.body; // changed username to email
    if (!email || !password)
        return res.status(400).json({ message: "Email and password required" });

    db.get(`SELECT * FROM users WHERE email = ?`, [email], async (err, user) => {
        if (err) return res.status(500).json({ message: "Database error" });
        if (!user) return res.status(400).json({ message: "Invalid email or password" });

        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(400).json({ message: "Invalid email or password" });

        res.json({
            message: "Login successful",
            user: { id: user.id, fullname: user.fullname, email: user.email }
        });
    });
});

// ===============================
// MUSIC LIST (for index.html)
// ===============================
app.get("/music", (req, res) => {
    const musicDir = path.join(__dirname, "uploads");
    if (!fs.existsSync(musicDir)) return res.json([]);

    fs.readdir(musicDir, (err, files) => {
        if (err) return res.json([]);

        const songs = files
            .filter(f => f.endsWith(".mp3"))
            .map(f => ({
                filename: f,
                title: path.parse(f).name,
                artist: "Unknown Artist"
            }));

        res.json(songs);
    });
});

// ===============================
// FILE UPLOAD
// ===============================
app.post("/api/upload", upload.fields([
  { name: "audio", maxCount: 1 },
  { name: "cover", maxCount: 1 }
]), (req, res) => {
  try {
    if (!req.files || !req.files.audio) {
      return res.status(400).json({ error: "Audio file is required" });
    }

    const audioFile = req.files.audio[0];
    const coverFile = req.files.cover ? req.files.cover[0] : null;

    // Extract metadata from form
    const {
      title,
      artist,
      album,
      release_date,
      language,
      country,
      genre,
      explicit,
      bpm
    } = req.body;

    // Save metadata to DB
    const query = `
      INSERT INTO tracks (title, artist, filename, plays, top_monday, uploaded_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;
    db.run(query, [
      title || path.parse(audioFile.originalname).name,
      artist || "Unknown Artist",
      audioFile.filename,
      bpm || 0,
      explicit === "yes" ? 1 : 0
    ], function (err) {
      if (err) {
        console.error("DB error:", err.message);
        return res.status(500).json({ error: "Database error" });
      }

      res.json({
        message: "Upload successful",
        trackId: this.lastID,
        audio: audioFile.filename,
        cover: coverFile ? coverFile.filename : null,
        metadata: {
          title,
          artist,
          album,
          release_date,
          language,
          country,
          genre,
          explicit,
          bpm
        }
      });
    });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: "Server error during upload" });
  }
});
// ===============================
// START SERVER
// ===============================
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});