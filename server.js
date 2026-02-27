// server.js
const express = require("express");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

// === Middleware ===
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/covers", express.static(path.join(__dirname, "covers")));

// Ensure directories exist
["uploads", "covers"].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
});

// === Database ===
const db = new sqlite3.Database("./waka.db", (err) => {
  if (err) console.error("DB Error:", err);
  else console.log("Connected to SQLite database.");
});

// Create tables if not exist
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    email TEXT UNIQUE,
    password TEXT,
    bio TEXT,
    join_date TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    artist TEXT,
    album TEXT,
    release_date TEXT,
    language TEXT,
    country TEXT,
    genre TEXT,
    explicit TEXT,
    bpm INTEGER,
    file TEXT,
    cover TEXT,
    plays INTEGER DEFAULT 0,
    top_monday INTEGER DEFAULT 0,
    uploaded_by INTEGER,
    FOREIGN KEY(uploaded_by) REFERENCES users(id)
  )`);
});

// === Multer setup for uploads ===
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === "audio") cb(null, "./uploads");
    else if (file.fieldname === "cover") cb(null, "./covers");
    else cb(null, "./uploads");
  },
  filename: (req, file, cb) => {
    const name = Date.now() + "-" + file.originalname.replace(/\s+/g, "_");
    cb(null, name);
  }
});
const upload = multer({ storage });

// === Routes ===

// Upload a track
app.post("/api/upload", upload.fields([
  { name: "audio", maxCount: 1 },
  { name: "cover", maxCount: 1 }
]), (req, res) => {
  try {
    const data = req.body;
    const audioFile = req.files.audio[0].filename;
    const coverFile = req.files.cover ? req.files.cover[0].filename : null;

    db.run(`INSERT INTO tracks 
      (title, artist, album, release_date, language, country, genre, explicit, bpm, file, cover, top_monday, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.title,
        data.artist,
        data.album,
        data.release_date,
        data.language,
        data.country,
        data.genre,
        data.explicit,
        data.bpm,
        audioFile,
        coverFile,
        data.top_monday || 0,
        data.uploaded_by // <-- IMPORTANT: store user ID here
      ],
      function(err) {
        if (err) return res.status(500).json({ error: "DB insert failed", details: err });
        res.json({ message: "Track uploaded successfully!" });
      }
    );

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Upload failed" });
  }
});

// Get portfolio of a specific user
app.get("/api/user-portfolio/:userId", (req, res) => {
  const userId = req.params.userId;

  // Fetch user info
  db.get("SELECT id, username, bio, join_date FROM users WHERE id = ?", [userId], (err, user) => {
    if (err) return res.status(500).json({ error: "Failed to fetch user info" });
    if (!user) return res.json({ user: null, portfolio: [] });

    // Fetch tracks uploaded by this user
    db.all("SELECT id, title, artist, album, release_date, country, genre, file as audio, cover as img, 'song' as type FROM tracks WHERE uploaded_by = ? ORDER BY id DESC", 
      [userId], 
      (err, tracks) => {
        if (err) return res.status(500).json({ error: "Failed to fetch user's tracks" });
        res.json({ user, portfolio: tracks });
      }
    );
  });
});

// Existing routes (top songs, albums, Malawi, Monday, login, register, play...) remain the same
// ... [You can keep all other API routes from your original server.js here] ...

// === Start server ===
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));