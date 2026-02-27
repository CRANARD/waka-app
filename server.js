const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();

// Use Render's port if deployed, otherwise 3000 locally
const PORT = process.env.PORT || 3000;

// --- Middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/covers", express.static(path.join(__dirname, "covers")));
app.use("/assets", express.static(path.join(__dirname, "image")));

// --- Ensure directories exist ---
["uploads", "covers"].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
});

// --- Database ---
const dbFile = "./waka.db";
const db = new sqlite3.Database(dbFile, (err) => {
  if (err) console.error("DB error:", err);
  else console.log(`Connected to SQLite DB: ${dbFile}`);
});

// Create tables if they don't exist
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    email TEXT UNIQUE,
    password TEXT
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
    cover TEXT
  )`);
});

// --- Multer setup for file uploads ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === "audio") cb(null, "./uploads");
    else if (file.fieldname === "cover") cb(null, "./covers");
    else cb(null, "./uploads");
  },
  filename: (req, file, cb) => {
    const name = Date.now() + "-" + file.originalname.replace(/\s+/g, "_");
    cb(null, name);
  },
});
const upload = multer({ storage });

// --- Routes ---

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
      (title, artist, album, release_date, language, country, genre, explicit, bpm, file, cover)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        coverFile
      ],
      function(err) {
        if (err) return res.status(500).json({ error: "DB insert failed" });
        res.json({ message: "Track uploaded successfully!" });
      }
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Upload failed" });
  }
});

// Get all tracks
app.get("/api/tracks", (req, res) => {
  db.all("SELECT * FROM tracks ORDER BY id DESC", (err, rows) => {
    if (err) return res.status(500).json({ error: "Failed to fetch tracks" });
    res.json(rows);
  });
});

// Get artists with tracks
app.get("/api/artists", (req, res) => {
  db.all(
    `SELECT artist, COUNT(*) as trackCount, MAX(cover) as cover 
     FROM tracks GROUP BY artist`,
    (err, rows) => {
      if (err) return res.status(500).json({ error: "Failed to fetch artists" });
      const artists = rows.map(r => ({
        name: r.artist,
        trackCount: r.trackCount,
        cover: r.cover || "default.jpg"
      }));
      artists.sort((a, b) => b.trackCount - a.trackCount);
      res.json(artists);
    }
  );
});

// Register user
app.post("/api/register", (req, res) => {
  const { username, email, password } = req.body;
  db.run(
    `INSERT INTO users (username, email, password) VALUES (?, ?, ?)`,
    [username, email, password],
    function(err) {
      if (err) return res.status(400).json({ error: "User already exists" });
      res.json({ message: "Registration successful" });
    }
  );
});

// Login user
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  db.get(
    "SELECT * FROM users WHERE username = ? AND password = ?",
    [username, password],
    (err, row) => {
      if (err) return res.status(500).json({ error: "DB error" });
      if (!row) return res.status(401).json({ error: "Invalid credentials" });
      res.json({ message: "Login successful", user: { id: row.id, username: row.username, email: row.email } });
    }
  );
});

// --- Start server ---
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Server is running!");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});