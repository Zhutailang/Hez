/**
 * Local demo API entry: uses a separate SQLite file and seeds fake users/rooms.
 * Usage: npm run demo:server
 */
process.env.HEZ_DEMO = "1";
process.env.DATABASE_PATH = process.env.DATABASE_PATH || "./data/hez-demo.db";
process.env.JWT_SECRET = process.env.JWT_SECRET || "hez-demo-jwt-not-for-production";
process.env.CORS_ORIGIN =
  process.env.CORS_ORIGIN || "http://localhost:5173,http://127.0.0.1:5173";

await import("./index.js");
