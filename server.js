const express = require("express");
const helmet = require("helmet");
const multer = require("multer");
const rateLimit = require("express-rate-limit");
const { Pool } = require("pg");
const crypto = require("crypto");
const config = require("./config");

const app = express();
const PORT = Number(config.port || 8080);
const MAX_FILE_SIZE = Number(config.maxFileSizeMb || 20) * 1024 * 1024;

if (!config.adminPassword || config.adminPassword.length < 16 ||
    config.adminPassword.includes("SET_A_NEW_")) {
  console.error("Set a unique adminPassword of at least 16 characters in config.js.");
  process.exit(1);
}
if (!config.databaseUrl || config.databaseUrl.includes("SET_NEW_DATABASE_PASSWORD_HERE")) {
  console.error("Set databaseUrl in config.js.");
  process.exit(1);
}

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
      defaultSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"], imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'none'"]
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
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 100 }
});

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.nahid_file_store (
      id uuid PRIMARY KEY,
      original_name text NOT NULL,
      mime_type text NOT NULL DEFAULT 'application/octet-stream',
      size_bytes bigint NOT NULL,
      file_data bytea NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS nahid_file_store_created_at_idx
    ON public.nahid_file_store (created_at DESC)
  `);
}

app.get("/login", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.type("html").send(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>دخول الإدارة</title><style>*{box-sizing:border-box}body{margin:0;background:#101820;color:#eef4f7;font:16px system-ui;display:grid;min-height:100vh;place-items:center;padding:20px}.card{width:min(420px,100%);background:#192833;border:1px solid #304653;border-radius:18px;padding:28px}h1{font-size:23px}p{color:#b7c6ce;line-height:1.7}input,button{width:100%;padding:14px;border-radius:10px;font:inherit}input{background:#0f1a21;border:1px solid #405663;color:white;margin:12px 0}button{background:#19a68f;border:0;color:#061b18;font-weight:700}</style><main class="card"><h1>مركز الملفات الخاص</h1><p>هذه الصفحة محمية بكلمة مرور الإدارة.</p><form method="post" action="/login"><input type="password" name="password" placeholder="كلمة المرور" required autocomplete="current-password"><button>دخول</button></form></main></html>`);
});
app.post("/login", loginLimiter, (req, res) => {
  if (!safeEqual(req.body.password || "", config.adminPassword)) {
    return res.status(401).type("html").send("كلمة المرور غير صحيحة. <a href='/login'>إعادة المحاولة</a>");
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
  res.sendFile(require("path").join(__dirname, "public", "index.html"));
});
app.use("/assets", auth, express.static(require("path").join(__dirname, "public", "assets"), { fallthrough: false }));

app.get("/api/status", auth, apiLimiter, async (_req, res) => {
  try {
    const r = await pool.query("SELECT NOW() AS server_time, current_database() AS database, current_user AS username, version() AS version");
    const count = await pool.query("SELECT count(*)::int AS files, COALESCE(sum(size_bytes),0)::bigint AS bytes FROM public.nahid_file_store");
    res.json({ app: "online", database: { connected: true, ...r.rows[0] }, storage: count.rows[0] });
  } catch (e) {
    res.status(503).json({ app: "online", database: { connected: false, error: e.message } });
  }
});

app.post("/api/upload", auth, apiLimiter, upload.array("files", 100), async (req, res) => {
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: "لم يتم اختيار ملفات." });
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
      added.push({ id, name: original, size: f.size, uploadedAt: new Date().toISOString(), url: `/files/${id}` });
    }
    await client.query("COMMIT");
    res.status(201).json({ uploaded: added.length, files: added });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Upload failed:", e.message);
    res.status(500).json({ error: "فشل حفظ الملفات في PostgreSQL. تحقق من اتصال قاعدة البيانات وحجم الملف." });
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
    res.json(r.rows.map(x => ({ ...x, url: `/files/${x.id}` })));
  } catch (e) { res.status(500).json({ error: "تعذر قراءة الملفات" }); }
});

app.get("/files/:id", auth, async (req, res) => {
  if (!/^[a-f0-9-]{36}$/i.test(req.params.id)) return res.status(404).send("File not found");
  try {
    const r = await pool.query(
      "SELECT original_name, mime_type, file_data FROM public.nahid_file_store WHERE id=$1",
      [req.params.id]
    );
    if (!r.rowCount) return res.status(404).send("File not found");
    const f = r.rows[0];
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(f.original_name)}`);
    res.type("application/octet-stream").send(f.file_data);
  } catch (e) { res.status(500).send("تعذر تنزيل الملف"); }
});

app.delete("/api/files/:id", auth, apiLimiter, async (req, res) => {
  if (!/^[a-f0-9-]{36}$/i.test(req.params.id)) return res.status(404).json({ error: "File not found" });
  try {
    const r = await pool.query("DELETE FROM public.nahid_file_store WHERE id=$1 RETURNING id", [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: "File not found" });
    res.json({ deleted: true, id: req.params.id });
  } catch (e) { res.status(500).json({ error: "تعذر حذف الملف" }); }
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.use((err, _req, res, _next) => {
  console.error(err);
  if (err instanceof multer.MulterError) return res.status(400).json({ error: err.message });
  res.status(500).json({ error: "Internal server error" });
});

initializeDatabase()
  .then(() => app.listen(PORT, "0.0.0.0", () => console.log(`NAHID file host listening on ${PORT}`)))
  .catch(err => {
    console.error("PostgreSQL initialization failed:", err.message);
    process.exit(1);
  });
