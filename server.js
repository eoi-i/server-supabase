const express = require("express");
const helmet = require("helmet");
const multer = require("multer");
const rateLimit = require("express-rate-limit");
const { Pool } = require("pg");
const crypto = require("crypto");
const path = require("path");
const config = require("./config");

const app = express();
const PORT = Number(process.env.PORT || config.port || 8080);

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
  idleTimeoutMillis: 30000,
  max: 5
});

app.set("trust proxy", 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"]
    }
  },
  crossOriginResourcePolicy: { policy: "same-origin" }
}));
app.use(express.urlencoded({ extended: false, limit: "16kb" }));
app.use(express.json({ limit: "1mb" }));

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, limit: 120,
  standardHeaders: "draft-7", legacyHeaders: false
});
// لا يوجد حد أقصى لحجم الملف
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 100 }
});

app.get("/", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
app.use("/assets", express.static(path.join(__dirname, "public", "assets"), { fallthrough: false }));

app.get("/api/status", apiLimiter, async (_req, res) => {
  try {
    const r = await pool.query("SELECT NOW() AS server_time");
    const count = await pool.query("SELECT count(*)::int AS files, COALESCE(sum(size_bytes),0)::bigint AS bytes FROM public.nahid_file_store");
    res.json({ ok: true, database: { connected: true, time: r.rows[0].server_time }, storage: count.rows[0] });
  } catch (e) {
    res.status(503).json({ ok: false, database: { connected: false, error: e.message } });
  }
});

app.post("/api/upload", apiLimiter, upload.array("files", 100), async (req, res) => {
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: "لم يتم اختيار ملفات." });
  try {
    const r = await pool.query("SELECT 1 FROM public.nahid_file_store LIMIT 1");
  } catch (e) {
    return res.status(503).json({ error: "قاعدة البيانات غير متصلة" });
  }
  const client = await pool.connect();
  const added = [];
  try {
    await client.query("BEGIN");
    for (const f of files) {
      const id = crypto.randomUUID();
      const original = String(f.originalname || "file").replace(/\\/g, "/").split("/").pop().replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 240) || "file";
      await client.query(
        `INSERT INTO public.nahid_file_store (id, original_name, mime_type, size_bytes, file_data)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, original, f.mimetype || "application/octet-stream", f.size, f.buffer]
      );
      added.push({ id, name: original, size: f.size, uploadedAt: new Date().toISOString() });
    }
    await client.query("COMMIT");
    res.status(201).json({ uploaded: added.length, files: added });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Upload failed:", e.message);
    res.status(500).json({ error: "فشل رفع الملف إلى قاعدة البيانات." });
  } finally {
    client.release();
  }
});

app.get("/api/files", apiLimiter, async (_req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, original_name AS name, size_bytes AS size, created_at AS "uploadedAt"
       FROM public.nahid_file_store ORDER BY created_at DESC LIMIT 1000`
    );
    const base = `${_req.protocol}://${_req.get("host")}`;
    res.json(r.rows.map(x => ({ ...x, url: `${base}/files/${x.id}` })));
  } catch (e) { res.status(500).json({ error: "تعذر قراءة الملفات" }); }
});

app.get("/files/:id", async (req, res) => {
  if (!/^[a-f0-9-]{36}$/i.test(req.params.id)) return res.status(404).send("File not found");
  try {
    const r = await pool.query("SELECT file_data, mime_type, original_name FROM public.nahid_file_store WHERE id=$1", [req.params.id]);
    if (!r.rowCount) return res.status(404).send("File not found");
    const { file_data, mime_type, original_name } = r.rows[0];
    res.setHeader("Content-Type", mime_type);
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(original_name)}"`);
    res.setHeader("Content-Length", file_data.length);
    res.send(file_data);
  } catch (e) { res.status(500).send("تعذر فتح الملف"); }
});

app.delete("/api/files/:id", apiLimiter, async (req, res) => {
  if (!/^[a-f0-9-]{36}$/i.test(req.params.id)) return res.status(404).json({ error: "File not found" });
  try {
    const r = await pool.query("DELETE FROM public.nahid_file_store WHERE id=$1 RETURNING id", [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: "File not found" });
    res.json({ deleted: true, id: req.params.id });
  } catch (e) { res.status(500).json({ error: "تعذر حذف الملف" }); }
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  if (err instanceof multer.MulterError) return res.status(400).json({ error: err.message });
  res.status(500).json({ error: "Internal server error" });
});

async function initializeDatabase() {
  try {
    await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.nahid_file_store (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        original_name text NOT NULL,
        mime_type text NOT NULL DEFAULT 'application/octet-stream',
        size_bytes bigint NOT NULL,
        file_data bytea NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS nahid_file_store_created_at_idx ON public.nahid_file_store (created_at DESC)`);
    console.log("Database initialized successfully");
  } catch (e) {
    console.error("Database init failed:", e.message);
  }
}

initializeDatabase()
  .then(() => app.listen(PORT, "0.0.0.0", () => console.log(`NAHID file host listening on ${PORT}`)))
  .catch(err => {
    console.error("Listen failed:", err.message);
    process.exit(1);
  });
