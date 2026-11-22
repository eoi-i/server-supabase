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

const sessions = new Map();
const SESSION_TTL = 12 * 60 * 60 * 1000;
function safeEqual(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
function cookies(req) {
  const out = {};
  (req.headers.cookie || "").split(";").forEach(part => {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}
function auth(req, res, next) {
  const sid = cookies(req).sid;
  const session = sid && sessions.get(sid);
  if (!session || session.expires < Date.now()) {
    if (sid) sessions.delete(sid);
    return res.redirect("/login");
  }
  session.expires = Date.now() + SESSION_TTL;
  req.sid = sid;
  next();
}
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 10,
  standardHeaders: "draft-7", legacyHeaders: false
});
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, limit: 120,
  standardHeaders: "draft-7", legacyHeaders: false
});
// لا يوجد حد أقصى لحجم الملف
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 100 }
});

const LOGIN_PAGE = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>تسجيل الدخول - مركز الملفات</title><style>*{box-sizing:border-box;margin:0;padding:0}html,body{height:100%}body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Tahoma,sans-serif;background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);color:#f1f5f9;display:grid;place-items:center;padding:24px}.card{width:min(400px,92%);background:#1e293b;border:1px solid #334155;border-radius:16px;padding:36px 28px;box-shadow:0 20px 40px -10px rgba(0,0,0,0.4)}.brand{display:flex;align-items:center;gap:10px;margin-bottom:8px}.brand .dot{width:10px;height:10px;background:#22d3ee;border-radius:50%;box-shadow:0 0 12px #22d3ee}h1{font-size:20px;font-weight:700;margin-bottom:4px}p{color:#94a3b8;font-size:14px;margin-bottom:24px}.form{display:flex;flex-direction:column;gap:14px}input{width:100%;padding:12px 14px;border-radius:10px;border:1px solid #475569;background:#0f172a;color:#f1f5f9;font-size:14px}input:focus{outline:none;border-color:#3b82f6}button{width:100%;padding:12px;border-radius:10px;border:none;background:#3b82f6;color:white;font-size:15px;font-weight:700;cursor:pointer}button:hover{background:#2563eb}button:active{transform:translateY(1px)}.err{color:#f87171;font-size:13px;text-align:center;margin-top:8px}</style></head><body><div class="card"><div class="brand"><div class="dot"></div><div><div style="font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px">مركز الملفات الخاص</div><div style="font-size:16px;font-weight:800">تسجيل الدخول</div></div></div><p>أدخل كلمة مرور الإدارة للدخول إلى لوحة الملفات.</p><form method="post" action="/login" class="form"><input type="password" name="password" placeholder="كلمة المرور" required autocomplete="current-password"><button type="submit">دخول</button></form><div id="err" class="err"></div></div><script>const params=new URLSearchParams(location.search);if(params.get("bad"))document.getElementById("err").textContent="كلمة المرور غير صحيحة، يرجى المحاولة مرة أخرى.";</script></body></html>`;

app.get("/login", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.type("html").send(LOGIN_PAGE);
});
app.post("/login", loginLimiter, (req, res) => {
  if (!safeEqual(req.body.password || "", config.adminPassword)) {
    return res.redirect("/login?bad=1");
  }
  const sid = crypto.randomBytes(32).toString("hex");
  sessions.set(sid, { expires: Date.now() + SESSION_TTL });
  res.setHeader("Set-Cookie", `sid=${sid}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL / 1000}`);
  res.redirect("/");
});
app.post("/logout", auth, (req, res) => {
  sessions.delete(req.sid);
  res.setHeader("Set-Cookie", "sid=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0");
  res.redirect("/login");
});
app.get("/", auth, (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
app.use("/assets", auth, express.static(path.join(__dirname, "public", "assets"), { fallthrough: false }));

app.get("/api/status", auth, apiLimiter, async (_req, res) => {
  try {
    const r = await pool.query("SELECT NOW() AS server_time");
    const count = await pool.query("SELECT count(*)::int AS files, COALESCE(sum(size_bytes),0)::bigint AS bytes FROM public.nahid_file_store");
    res.json({ ok: true, database: { connected: true, time: r.rows[0].server_time }, storage: count.rows[0] });
  } catch (e) {
    res.status(503).json({ ok: false, database: { connected: false, error: e.message } });
  }
});

app.post("/api/upload", auth, apiLimiter, upload.array("files", 100), async (req, res) => {
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

app.get("/api/files", auth, apiLimiter, async (_req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, original_name AS name, size_bytes AS size, created_at AS "uploadedAt"
       FROM public.nahid_file_store ORDER BY created_at DESC LIMIT 1000`
    );
    const base = `${_req.protocol}://${_req.get("host")}`;
    res.json(r.rows.map(x => ({ ...x, url: `${base}/files/${x.id}` })));
  } catch (e) { res.status(500).json({ error: "تعذر قراءة الملفات" }); }
});

app.get("/files/:id", auth, async (req, res) => {
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

app.delete("/api/files/:id", auth, apiLimiter, async (req, res) => {
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
