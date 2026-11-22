const $ = id => document.getElementById(id);
let selected = [];

function choose(files) {
  selected = Array.from(files || []);
  const n = selected.length;
  $("selection").textContent = n ? `تم اختيار ${n} ملف${n > 1 ? "ات" : ""}` : "لم يتم اختيار ملفات.";
}

$("file-input").onchange = e => choose(e.target.files);
$("folder-input").onchange = e => choose(e.target.files);

// Drag & drop
const zone = $("upload-zone");
["dragenter","dragover"].forEach(evt => zone.addEventListener(evt, e => { e.preventDefault(); zone.classList.add("dragover"); }));
["dragleave","drop"].forEach(evt => zone.addEventListener(evt, e => { e.preventDefault(); zone.classList.remove("dragover"); }));
zone.addEventListener("drop", e => {
  const dt = e.dataTransfer;
  if (dt && dt.files.length) choose(dt.files);
});

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
  if (!bytes && bytes !== 0) return "—";
  const k = 1024;
  const sizes = ["بايت", "كيلوبايت", "ميجابايت", "جيجابايت"];
  let i = 0, n = Number(bytes);
  while (n >= k && i < sizes.length - 1) { n /= k; i++; }
  return `${n.toFixed(i === 0 ? 0 : 2)} ${sizes[i]}`;
}

function showToast(msg, type = "ok") {
  const t = $("toast");
  t.textContent = msg;
  t.className = type === "err" ? "show err" : "show ok";
  setTimeout(() => t.classList.remove("show"), 2500);
}

async function status() {
  try {
    const r = await fetch("/api/status");
    const d = await r.json();
    const pill = $("status-pill");
    if (d.ok && d.database.connected) {
      pill.textContent = "قاعدة البيانات متصلة";
      pill.className = "pill ok";
    } else {
      pill.textContent = "قاعدة البيانات غير متصلة";
      pill.className = "pill bad";
    }
  } catch (e) {
    $("status-pill").textContent = "تعذر الاتصال بالخادم";
    $("status-pill").className = "pill bad";
  }
}

async function list() {
  try {
    const r = await fetch("/api/files");
    const fs = await r.json();
    const container = $("files-list");
    container.innerHTML = "";

    if (!fs || !fs.length) {
      container.innerHTML = `<div class="empty"><div class="icon">📭</div><div>لا توجد ملفات مرفوعة بعد.</div></div>`;
      return;
    }

    // إحصائيات
    let totalSize = 0;
    fs.forEach(f => totalSize += Number(f.size || 0));
    $("stat-files").textContent = fs.length;
    $("stat-size").textContent = formatSize(totalSize);

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
      meta.textContent = `${formatSize(f.size)} · ${new Date(f.uploadedAt).toLocaleString("ar-SA")}`;
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
      container.append(row);
    });
  } catch (e) {
    $("files-list").innerHTML = `<div class="empty"><div class="icon">⚠️</div><div>تعذر تحميل القائمة.</div></div>`;
  }
}

$("btn-upload").onclick = async () => {
  if (!selected.length) { showToast("اختر ملفات أولاً", "err"); return; }
  const form = new FormData();
  selected.forEach(f => form.append("files", f));
  $("message").textContent = "جارٍ الرفع…";
  $("message").className = "";
  try {
    const r = await fetch("/api/upload", { method: "POST", body: form });
    const d = await r.json();
    if (!r.ok) { $("message").textContent = d.error || "فشل الرفع"; $("message").className = "msg-err"; showToast(d.error || "فشل الرفع", "err"); return; }
    $("message").textContent = `تم رفع ${d.uploaded} ملف بنجاح.`;
    $("message").className = "msg-ok";
    showToast(`تم رفع ${d.uploaded} ملف`);
    choose([]);
    $("file-input").value = "";
    $("folder-input").value = "";
    list();
    status();
  } catch (e) {
    $("message").textContent = "خطأ في الشبكة";
    $("message").className = "msg-err";
    showToast("خطأ في الشبكة", "err");
  }
};

$("btn-refresh").onclick = () => { list(); status(); };

status().catch(() => {});
list().catch(() => {});
