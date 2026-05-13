import "dotenv/config";
import express from "express";
import cors from "cors";
import { connectDB } from "./config/db.js";
import { notFound, errorHandler } from "./middleware/errorHandler.js";

const app = express();

// Which clients are allowed to access the API
const allowedOrigins = (process.env.CLIENT_URL || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const corsOptions = {
    origin: (origin, callback) => {
        // Allow request with no origin (curl, same-origin, server-to-server)
        if (!origin) return callback(null, true);
        // Allow any localhost / 127.0.0.1 origin in development
        if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) {return callback(null, true);}
        // Allow anything explicitly listed in CLIENT_URL (comma-separated)
        if (allowedOrigins.includes(origin)) {return callback(null, true)}
        return callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
};

// Passing Middleware
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json({ limit: "1mb"}));

app.get("/api/health", (req, res) => {
    res.send({ status: "ok", time: new Date().toISOString() });
});

app.use(notFound);
app.use(errorHandler);

// Starting server

const PORT = process.env.PORT || 8000;

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Error starting server", err);
    process.exit(1);
  });