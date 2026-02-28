// ===============================
// server.js
// ===============================

const express = require("express");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcryptjs"); // bcryptjs for hashing
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const fetch = require("node-fetch"); // required for Node.js fetch

const app = express();
const PORT = process.env.PORT || 3000;

// ===============================
// Middleware
// ===============================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static("public"));

// ===============================
// Database Setup
// ===============================
const db = new sqlite3.Database("./database.db", (err) => {
    if (err) console.error("Database error:", err.message);
    else console.log("Connected to SQLite database.");
});

// Create Users Table if not exists
db.run(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fullname TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

// Create Tracks Table if not exists (for top-monday)
db.run(`
    CREATE TABLE IF NOT EXISTS tracks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        artist TEXT,
        cover TEXT,
        plays INTEGER DEFAULT 0,
        top_monday INTEGER DEFAULT 0
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
// ROUTES
// ===============================

// Health Check
app.get("/", (req, res) => {
    res.json({ message: "Server is running successfully 🚀" });
});

// ===============================
// REGISTER ROUTE
// ===============================
app.post("/register", async (req, res) => {
    const { fullname, email, password } = req.body;

    if (!fullname || !email || !password) {
        return res.status(400).json({ message: "All fields are required" });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const query = `INSERT INTO users (fullname, email, password) VALUES (?, ?, ?)`;

        db.run(query, [fullname, email, hashedPassword], function (err) {
            if (err) {
                if (err.message.includes("UNIQUE")) {
                    return res.status(400).json({ message: "Email already exists" });
                }
                return res.status(500).json({ message: "Database error" });
            }

            res.status(201).json({
                message: "User registered successfully",
                userId: this.lastID
            });
        });

    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
});

// ===============================
// LOGIN ROUTE
// ===============================
app.post("/login", (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: "Email and password required" });
    }

    const query = `SELECT * FROM users WHERE email = ?`;

    db.get(query, [email], async (err, user) => {
        if (err) return res.status(500).json({ message: "Database error" });
        if (!user) return res.status(400).json({ message: "Invalid email or password" });

        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(400).json({ message: "Invalid email or password" });

        res.json({
            message: "Login successful",
            user: {
                id: user.id,
                fullname: user.fullname,
                email: user.email
            }
        });
    });
});

// ===============================
// External Chart Routes
// ===============================
const LASTFM_KEY = "d43e9bc3bb4f3f32057856b8fe07173d"; // your real API key

// Top Songs
app.get("/api/top-songs", async (req, res) => {
    try {
        const response = await fetch(`http://ws.audioscrobbler.com/2.0/?method=chart.gettoptracks&api_key=${LASTFM_KEY}&format=json`);
        const data = await response.json();

        const tracks = (data.tracks && data.tracks.track) ? data.tracks.track.map(t => ({
            title: t.name || "Unknown",
            artist: t.artist?.name || "Unknown",
            cover: t.image?.[2]?.["#text"] || "/covers/default.png"
        })) : [];

        res.json(tracks);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch top songs" });
    }
});

// Top Albums
app.get("/api/top-albums", async (req, res) => {
    try {
        const response = await fetch(`http://ws.audioscrobbler.com/2.0/?method=chart.gettopalbums&api_key=${LASTFM_KEY}&format=json`);
        const data = await response.json();

        const albums = (data.albums && data.albums.album) ? data.albums.album.map(a => ({
            title: a.name || "Unknown",
            artist: a.artist?.name || "Unknown",
            cover: a.image?.[2]?.["#text"] || "/covers/default.png"
        })) : [];

        res.json(albums);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch top albums" });
    }
});

// Top Malawi Tracks
app.get("/api/top-malawi", async (req, res) => {
    try {
        const response = await fetch(`http://ws.audioscrobbler.com/2.0/?method=geo.gettoptracks&country=Malawi&api_key=${LASTFM_KEY}&format=json`);
        const data = await response.json();

        const malawiTracks = (data.tracks && data.tracks.track) ? data.tracks.track.map(t => ({
            title: t.name || "Unknown",
            artist: t.artist?.name || "Unknown",
            cover: t.image?.[2]?.["#text"] || "/covers/default.png"
        })) : [];

        res.json(malawiTracks);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch Malawi tracks" });
    }
});

// Top Made on Monday (from DB)
app.get("/api/top-monday", (req, res) => {
    db.all(
        "SELECT id, title, artist, cover, plays FROM tracks WHERE top_monday = 1 ORDER BY plays DESC LIMIT 20",
        [],
        (err, rows) => {
            if (err) return res.status(500).json({ error: "Failed to fetch Monday tracks" });
            res.json(rows);
        }
    );
});

// ===============================
// File Upload Route (example)
// ===============================
app.post("/upload", upload.single("file"), (req, res) => {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    res.json({
        message: "File uploaded successfully",
        file: req.file.filename
    });
});

// ===============================
// START SERVER
// ===============================
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});