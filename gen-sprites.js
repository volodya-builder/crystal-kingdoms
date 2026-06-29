/* ============================================================
   АВТО-ГЕНЕРАТОР СПРАЙТОВ ЗДАНИЙ для Crystal Kingdoms
   Через OpenAI Image API (модель gpt-image-1).

   Что делает:
   - для каждого здания генерит 10 уровней: assets/<тип>_l1.png … _l10.png;
   - уровень 1 рисуется с нуля, уровни 2–10 — НА ОСНОВЕ уровня 1 (image-edit),
     чтобы это было «то же здание, прокачанное», а не 10 разных построек;
   - прозрачный фон (background: transparent) — фон вырезать не надо;
   - можно оставить на ночь: устойчив к сбоям, докачивает только недостающее.

   ЗАПУСК (Windows PowerShell):
     $env:OPENAI_API_KEY="sk-..."; node gen-sprites.js
   ЗАПУСК (bash):
     OPENAI_API_KEY=sk-... node gen-sprites.js

   ФЛАГИ:
     --only cannon,hq      только эти здания (через запятую)
     --levels 1-10         диапазон уровней (напр. 1-3 или 5-5)
     --quality low|medium|high   качество (по умолч. medium)
     --no-ref              каждый уровень рисовать с нуля (без наследования)
     --force               перерисовать даже если файл уже есть
     --dry                 не вызывать API, только показать промты и смету
     --concurrency N       сколько зданий параллельно (по умолч. 1)

   Требуется Node 18+ (есть глобальный fetch/FormData/Blob).
   ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");

const API = "https://api.openai.com/v1/images";
const KEY = process.env.OPENAI_API_KEY;
const OUT = path.join(__dirname, "assets");

// ---------- разбор аргументов ----------
const argv = process.argv.slice(2);
const has = f => argv.includes(f);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const ONLY = (val("--only", "") || "").split(",").map(s => s.trim()).filter(Boolean);
const QUALITY = val("--quality", "medium");
const USE_REF = !has("--no-ref");
const FORCE = has("--force");
const DRY = has("--dry");
const CONC = Math.max(1, parseInt(val("--concurrency", "1"), 10) || 1);
let [LV_FROM, LV_TO] = (val("--levels", "1-10")).split("-").map(n => parseInt(n, 10));
LV_FROM = LV_FROM || 1; LV_TO = LV_TO || 10;

// ---------- общий стиль (одинаков для всех зданий) ----------
const STYLE = `isometric 2:1 game building sprite, "Clash of Clans" / "Heroes of Mavia" 3D render art style, clean soft studio lighting, slightly cartoonish but highly detailed and vibrant. COOL BLUE and navy armored theme with steel-grey stone, polished metal and subtle GOLD trim accents, glowing cyan energy details. Strict isometric view, camera from top-front about 30 degrees down. ONE single building only, centered, the whole object fully inside the frame and NOT cropped. Fully isolated on a TRANSPARENT background: no ground tile, no grass, no floor shadow, no text, no UI, no characters, no border. Sharp clean cut-out silhouette.`;

// ---------- тема каждого здания ----------
const BUILDINGS = {
  hq:        `a grand royal HEADQUARTERS castle keep — the main base building, a tall central tower with blue banners and a glowing crystal spire on top, large and imposing, big square footprint`,
  icemine:   `a GOLD COLLECTOR building — a mining rig extracting glowing golden ore, a small pile of gold nuggets, a little conveyor, gold-tinted machinery`,
  stonepump: `an OIL COLLECTOR pumpjack — an industrial oil pump with a horizontal rocking beam arm, pipes and a small oil tank, dark metal with blue panels`,
  icestore:  `a GOLD STORAGE vault — a sturdy armored treasury vault with a thick round metal door, glowing gold coins and bars visible inside`,
  stonestore:`an OIL STORAGE tank — a large cylindrical industrial fuel tank with pipes, pressure gauges and rivets, blue and steel`,
  camp:      `an ARMY CAMP — a military encampment with blue canvas tents, a small campfire pit, weapon racks and a flag`,
  factory:   `an INFANTRY FACTORY barracks — a fortified troop-training building with a big armored gate/door and training equipment`,
  hangar:    `an AIRCRAFT FACTORY hangar — an open aircraft hangar with a take-off ramp and a small fantasy flying machine parked inside`,
  lab:       `a LABORATORY — an arcane research lab with bubbling potions, glowing cyan crystals and a domed roof with an antenna`,
  altar:     `a HERO ALTAR shrine — a mystical magic altar with floating glowing runes, a hero pedestal, ornate gold and crystal details`,
  cannon:    `a CANNON defense turret — a single thick metal cannon barrel on a rotating armored swivel base, barrel aimed slightly down to the left`,
  flame:     `a FLAME TOWER defense turret — a wide multi-nozzle flamethrower turret on an armored base. Show the MACHINE design only, do NOT render any actual fire or flames`,
  aa:        `an ANTI-AIR defense turret — a twin surface-to-air missile launcher with the pods aimed steeply UPWARD at the sky, on a rotating armored base, cyan glowing missile tips (no red)`,
  mortar:    `a MORTAR defense turret — a short fat heavy mortar tube aimed steeply upward, on a round armored base`,
  wall:      `a single WALL segment — one thick fortified stone-and-metal defensive wall block with blue armor plating and gold trim, small square footprint`,
};

// ---------- описание уровня прокачки ----------
function levelTier(lv) {
  if (lv <= 3) return `EARLY level: simpler, smaller, slightly worn, basic materials, minimal decoration`;
  if (lv <= 6) return `MID level: reinforced with extra armor plates, some gold trim, cleaner polished metal, a few glowing cyan accents`;
  if (lv <= 9) return `HIGH level: heavily armored, prominent gold trim, polished, several glowing cyan crystals, larger and more elaborate`;
  return `MAXED legendary level: massive and ornate, covered in gold and large glowing crystals, royal decorations, the most powerful and impressive version`;
}
// промт для генерации с нуля
function promptFresh(type, lv) {
  return `${STYLE}\n\nSUBJECT: ${BUILDINGS[type]}.\nUPGRADE: level ${lv} of 10 — ${levelTier(lv)}. This is an upgrade tier of the building; keep the building's identity and footprint, only its richness/size reflects the level.`;
}
// промт для «прокачки» поверх уровня 1 (image-edit)
function promptUpgrade(type, lv) {
  return `Keep EXACTLY the same building, same shape, same camera angle and same transparent background as the input image. This is the SAME ${BUILDINGS[type]}, just upgraded to level ${lv} of 10: ${levelTier(lv)}. Add more armor plating, gold trim and glowing cyan crystals appropriate to the level; do not change the building into a different object. Keep it isolated on a transparent background.`;
}

// ---------- утилиты ----------
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LOG = path.join(__dirname, "gen-sprites.log");
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG, line + "\n"); } catch (_) {}
}
function fileFor(type, lv) { return path.join(OUT, `${type}_l${lv}.png`); }

// один вызов с ретраями
async function callWithRetry(fn, label) {
  let delay = 4000;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try { return await fn(); }
    catch (e) {
      const msg = (e && e.message) || String(e);
      log(`  ⚠ ${label}: попытка ${attempt}/5 не удалась — ${msg.slice(0, 160)}`);
      if (attempt === 5) throw e;
      await sleep(delay); delay = Math.min(delay * 2, 60000);
    }
  }
}

// генерация с нуля → возвращает Buffer PNG
async function genFresh(type, lv) {
  const body = {
    model: "gpt-image-1", prompt: promptFresh(type, lv),
    n: 1, size: "1024x1024", quality: QUALITY, background: "transparent", output_format: "png",
  };
  const res = await fetch(`${API}/generations`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  return Buffer.from(j.data[0].b64_json, "base64");
}

// прокачка поверх базовой картинки → Buffer PNG
async function genUpgrade(type, lv, baseBuf) {
  const fd = new FormData();
  fd.append("model", "gpt-image-1");
  fd.append("prompt", promptUpgrade(type, lv));
  fd.append("size", "1024x1024");
  fd.append("quality", QUALITY);
  fd.append("background", "transparent");
  fd.append("image", new Blob([baseBuf], { type: "image/png" }), "base.png");
  const res = await fetch(`${API}/edits`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${KEY}` },
    body: fd,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  return Buffer.from(j.data[0].b64_json, "base64");
}

// обработать одно здание (все его уровни)
async function doBuilding(type) {
  let baseBuf = null;
  // если уровень 1 уже есть на диске и используем наследование — берём его как базу
  if (USE_REF && fs.existsSync(fileFor(type, 1))) baseBuf = fs.readFileSync(fileFor(type, 1));
  for (let lv = LV_FROM; lv <= LV_TO; lv++) {
    const out = fileFor(type, lv);
    if (!FORCE && fs.existsSync(out)) {
      log(`• ${type} l${lv}: уже есть, пропуск`);
      if (lv === 1 && USE_REF && !baseBuf) baseBuf = fs.readFileSync(out);
      continue;
    }
    if (DRY) { log(`• ${type} l${lv}: [dry] ${USE_REF && lv > 1 ? "upgrade" : "fresh"}`); continue; }
    const useUpgrade = USE_REF && lv > 1 && baseBuf;
    log(`• ${type} l${lv}: генерирую (${useUpgrade ? "прокачка от l1" : "с нуля"}, ${QUALITY})…`);
    const buf = await callWithRetry(
      () => (useUpgrade ? genUpgrade(type, lv, baseBuf) : genFresh(type, lv)),
      `${type} l${lv}`
    );
    fs.writeFileSync(out, buf);
    log(`  ✓ сохранено: ${path.relative(__dirname, out)} (${(buf.length / 1024 | 0)} KB)`);
    if (lv === 1 && USE_REF) baseBuf = buf;     // базой для остальных уровней
    await sleep(800);                            // лёгкая пауза, чтобы не упереться в лимиты
  }
}

// простой пул concurrency
async function runPool(items, worker, conc) {
  let i = 0;
  const runners = Array.from({ length: conc }, async () => {
    while (i < items.length) { const idx = i++; await worker(items[idx]); }
  });
  await Promise.all(runners);
}

(async () => {
  if (!KEY && !DRY) { console.error("❌ Нет ключа. Задай OPENAI_API_KEY (или запусти с --dry для проверки промтов)."); process.exit(1); }
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

  let types = Object.keys(BUILDINGS);
  if (ONLY.length) types = types.filter(t => ONLY.includes(t));
  if (!types.length) { console.error("❌ Список зданий пуст (проверь --only)."); process.exit(1); }

  const nLevels = LV_TO - LV_FROM + 1;
  const total = types.length * nLevels;
  const price = { low: 0.011, medium: 0.042, high: 0.167 }[QUALITY] || 0.042;
  log("==================================================");
  log(`Генерация спрайтов: здания=${types.length} (${types.join(", ")})`);
  log(`Уровни: ${LV_FROM}–${LV_TO} (${nLevels}) | качество=${QUALITY} | наследование=${USE_REF ? "вкл" : "выкл"} | потоков=${CONC}`);
  log(`Всего картинок: ~${total} | ориентир. цена: ~$${(total * price).toFixed(2)} (грубо)`);
  log(`Папка вывода: ${OUT}`);
  if (DRY) log("РЕЖИМ --dry: API НЕ вызывается.");
  log("==================================================");

  const t0 = Date.now();
  await runPool(types, doBuilding, CONC);
  log(`✅ Готово за ${((Date.now() - t0) / 60000).toFixed(1)} мин. Файлы в assets/<тип>_l<уровень>.png`);
  log("Дальше: пришли мне это сообщение — я подключу пер-уровневые спрайты в игру.");
})().catch(e => { log("ФАТАЛЬНАЯ ОШИБКА: " + (e.message || e)); process.exit(1); });
