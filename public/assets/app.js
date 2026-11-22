const $ = id => document.getElementById(id);
let selected = [];

function choose(files) {
  selected = Array.from(files || []).filter(f => f && f.size !== undefined);
  const n = selected.length;
  const el = $("selection");
  if (el) el.textContent = n ? `تم اختيار ${n} ملف${n > 1 ? "ات" : ""}` : "لم يتم اختيار ملفات.";
}

const fileInput = $("file-input");
const folderInput = $("folder-input");
if (fileInput) fileInput.onchange = e => choose(e.target.files);
if (folderInput) folderInput.onchange = e => choose(e.target.files);

// Drag & drop
const zone = $("upload-zone");
if (zone) {
  ["dragenter","dragover"].forEach(evt => zone.addEventListener(evt, e => { e.preventDefault(); zone.classList.add("dragover"); }));
  ["dragleave","drop"].forEach(evt => zone.addEventListener(evt, e => { e.preventDefault(); zone.classList.remove("dragover"); }));
  zone.addEventListener("drop", e => {
    const dt = e.dataTransfer;
    if (dt && dt.files.length) choose(dt.files);
  });
}

function iconFor(name) {
  const ext = name.split(".").pop().toLowerCase();
  const map = {
    pdf: "📄", doc: "📘", docx: "📘", xls: "📗", xlsx: "📗",
    zip: "🗜️", rar: "🗜️", "7z": "🗜️",
    mp4: "🎬", mov: "🎬", mkv: "🎬",
    mp3: "🎵", wav: "🎵",
    jpg: "🖼️", jpeg: "🖼️", png: "🖼️", gif: "🖼️", webp: "🖼️",
    svg: "🖼️", ico: "🖼️",
    txt: "📝", md: "📝", csv: "📊", json: "📋",
    html: "🌐", css: "🎨", js: "📜", py: "🐍", php: "🐘",
    sql: "🗄️", xml: "📑"
  };
  return map[ext] || "📎";
}

function formatSize(bytes) {
  if (bytes == null || bytes === undefined) return "—";
  const k = 1024;
  const sizes = ["بايت", "كيلوبايت", "ميجابايت", "جيجابايت"];
  let i = 0, n = Number(bytes);
  while (n >= k && i < sizes.length - 1) { n /= k; i++; }
  return `${n.toFixed(i === 0 ? 0 : 2)} ${sizes[i]}`;
}

function showToast(msg, type = "ok") {
  const t = $("toast");
  if (!t) return;
  t.textContent = msg;
  t.className = type === "err" ? "show err" : "show ok";
  setTimeout(() => t.classList.remove("show"), 2500);
}

async function status() {
  const pill = $("status-pill");
  if (!pill) return;
  try {
    const r = await fetch("/api/status");
    const d = await r.json();
    if (d.ok && d.database && d.database.connected) {
      pill.textContent = "قاعدة البيانات متصلة";
      pill.className = "pill ok";
    } else {
      pill.textContent = "قاعدة البيانات غير متصلة";
      pill.className = "pill bad";
    }
  } catch (e) {
    pill.textContent = "تعذر الاتصال بالخادم";
    pill.className = "pill bad";
  }
}

async function list() {
  const container = $("files-list");
  const statFiles = $("stat-files");
  const statSize = $("stat-size");
  try {
    const r = await fetch("/api/files");
    const fs = await r.json();
    if (container) container.innerHTML = "";

    if (!fs || !fs.length) {
      if (container) container.innerHTML = `<div class="empty"><span class="icon">📭</span><div>لا توجد ملفات مرفوعة بعد.</div></div>`;
      if (statFiles) statFiles.textContent = "0";
      if (statSize) statSize.innerHTML = "0 <span class='unit'>بايت</span>";
      return;
    }

    let totalSize = 0;
    fs.forEach(f => totalSize += Number(f.size || 0));
    if (statFiles) statFiles.textContent = fs.length;
    if (statSize) statSize.innerHTML = formatSize(totalSize);

    fs.forEach(f => {
      const row = document.createElement("div");
      row.className = "file-row";

      const icon = document.createElement("div");
      icon.className = "file-icon";
      icon.textContent = iconFor(f.name);

      const info = document.createElement("div");
      info.className = "file-info";
      const name = document.createElement("div");
      name.className = "file-name";
      name.textContent = f.name;
      const meta = document.createElement("div");
      meta.className = "file-meta";
      meta.textContent = `${formatSize(f.size)}  ·  ${new Date(f.uploadedAt || f.created_at).toLocaleString("ar-SA")}`;
      info.append(name, meta);

      const actions = document.createElement("div");
      actions.className = "file-actions";

      const open = document.createElement("a");
      open.className = "btn-icon";
      open.href = f.url;
      open.target = "_blank";
      open.rel = "noopener";
      open.title = "فتح الملف";
      open.textContent = "🔗";

      const copy = document.createElement("button");
      copy.className = "btn-icon";
      copy.title = "نسخ الرابط";
      copy.textContent = "📋";
      copy.onclick = async () => {
        try {
          await navigator.clipboard.writeText(f.url);
          copy.textContent = "✅";
          setTimeout(() => copy.textContent = "📋", 1200);
        } catch (e) { showToast("فشل نسخ الرابط", "err"); }
      };

      const del = document.createElement("button");
      del.className = "btn-icon danger";
      del.title = "حذف الملف";
      del.textContent = "🗑️";
      del.onclick = async () => {
        if (!confirm(`هل تريد حذف "${f.name}" نهائياً؟`)) return;
        const x = await fetch(`/api/files/${f.id}`, { method: "DELETE" });
        if (x.ok) { list(); status(); showToast("تم حذف الملف"); }
        else showToast("تعذر حذف الملف", "err");
      };

      actions.append(open, copy, del);
      row.append(icon, info, actions);
      if (container) container.append(row);
    });
  } catch (e) {
    if (container) container.innerHTML = `<div class="empty"><span class="icon">⚠️</span><div>تعذر تحميل القائمة.</div></div>`;
  }
}

const btnUpload = $("btn-upload");
const message = $("message");
if (btnUpload) {
  btnUpload.onclick = async () => {
    if (!selected.length) { showToast("اختر ملفات أولاً", "err"); return; }
    const form = new FormData();
    selected.forEach(f => form.append("files", f));
    if (message) { message.textContent = "جارٍ الرفع…"; message.className = ""; }
    btnUpload.disabled = true;
    btnUpload.textContent = "جارٍ الرفع…";
    try {
      const r = await fetch("/api/upload", { method: "POST", body: form });
      const d = await r.json();
      if (!r.ok) {
        if (message) { message.textContent = d.error || "فشل الرفع"; message.className = "msg-err"; }
        showToast(d.error || "فشل الرفع", "err");
        return;
      }
      if (message) { message.textContent = `تم رفع ${d.uploaded} ملف بنجاح.`; message.className = "msg-ok"; }
      showToast(`تم رفع ${d.uploaded} ملف`);
      choose([]);
      if (fileInput) fileInput.value = "";
      if (folderInput) folderInput.value = "";
      list();
      status();
    } catch (e) {
      if (message) { message.textContent = "خطأ في الشبكة"; message.className = "msg-err"; }
      showToast("خطأ في الشبكة", "err");
    } finally {
      btnUpload.disabled = false;
      btnUpload.textContent = "رفع الملفات المحددة";
    }
  };
}

const btnRefresh = $("btn-refresh");
if (btnRefresh) btnRefresh.onclick = () => { list(); status(); };

status().catch(() => {});
list().catch(() => {});
