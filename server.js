import express from "express";
import helmet from "helmet";
import * as cheerio from "cheerio";

/* =======================
   ENV / AYARLAR
======================= */
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";

const PORT = Number(process.env.PORT || 3000);

// Etiket eşikleri (kt)
const STORM_KT = Number(process.env.STORM_KT || 34);               // Fırtına
const STRONG_STORM_KT = Number(process.env.STRONG_STORM_KT || 48); // Kuvvetli Fırtına

// Telegram / kontrol
const CHECK_INTERVAL_MS = Number(process.env.CHECK_INTERVAL_MS || 60000); // 1 dk
const ALERT_COOLDOWN_MS = Number(process.env.ALERT_COOLDOWN_MS || (60 * 60 * 1000)); // 60 dk

// Cache ve pencere
const CACHE_MS = Number(process.env.CACHE_MS || 60000); // 60 sn
const WINDOW_MS = 30 * 60 * 1000; // 30 dk

/* =======================
   EXPRESS
======================= */
const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.static("public"));

/* =======================
   KAYNAK
======================= */
const SOURCE_URL = "https://pirireis.mgm.gov.tr/domgi";
const TARGET_STATION = "TRABZON LİMANI ANA MENDİREK FENERİ";

/* =======================
   DURUM / CACHE
======================= */
let cache = { ts: 0, payload: null };
let lastAlertAt = 0;
let lastAlertKey = "";

// Son 30 dk rüzgâr örnekleri: { t(ms), kt, iso }
const windHistory = [];

/* =======================
   YARDIMCI FONKSİYONLAR
======================= */
function msToKnot(ms) {
  if (ms === null || ms === undefined || Number.isNaN(Number(ms))) return null;
  return Number(ms) * 0.51444; // ✅ m/s -> kt
}

function windLabel(kt) {
  if (kt === null) return "Bilinmiyor";
  if (kt >= STRONG_STORM_KT) return "Kuvvetli Fırtına";
  if (kt >= STORM_KT) return "Fırtına";
  return "Normal";
}

function addWindSample(iso, kt) {
  if (!iso || kt === null) return;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return;

  windHistory.push({ t, kt: Number(kt), iso });

  // 30 dakikadan eski örnekleri temizle (şimdiye göre)
  const cutoff = Date.now() - WINDOW_MS;
  while (windHistory.length && windHistory[0].t < cutoff) {
    windHistory.shift();
  }
}

function getWindStatsLast30m() {
  if (!windHistory.length) {
    return { maxKt: null, maxAtIso: null, avgKt: null, samples: 0 };
  }

  let max = windHistory[0];
  let sum = 0;

  for (const s of windHistory) {
    sum += s.kt;
    if (s.kt > max.kt) max = s;
  }

  return {
    maxKt: max.kt,
    maxAtIso: max.iso,
    avgKt: sum / windHistory.length,
    samples: windHistory.length,
  };
}

function getWindSeriesLast30m(limit = 180) {
  // performans için son limit kadar örnek döndür
  const sliced = windHistory.slice(-limit);
  return sliced.map((s) => ({ iso: s.iso, kt: s.kt }));
}

function normalizeTR(s) {
  return (s || "")
    .toUpperCase()
    .replaceAll("İ", "I")
    .replaceAll("İ", "I")
    .replaceAll("Ş", "S")
    .replaceAll("Ğ", "G")
    .replaceAll("Ü", "U")
    .replaceAll("Ö", "O")
    .replaceAll("Ç", "C")
    .replace(/\s+/g, " ")
    .trim();
}

function extractJsonArrayFromText(text) {
  const first = text.indexOf("[");
  const last = text.lastIndexOf("]");
  if (first === -1 || last === -1 || last <= first) return null;
  return text.slice(first, last + 1);
}

/* =======================
   TELEGRAM
======================= */
async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Telegram error ${res.status}: ${t}`);
  }
}

/* =======================
   VERİ ÇEKME
======================= */
async function fetchTrabzonObject() {
  const now = Date.now();
  if (cache.payload && now - cache.ts < CACHE_MS) return cache.payload;

  const res = await fetch(SOURCE_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (TrabzonFener/1.0)" },
  });
  if (!res.ok) throw new Error(`Kaynak çekilemedi: HTTP ${res.status}`);

  const html = await res.text();
  const $ = cheerio.load(html);
  const fullText = $.root().text();

  const jsonText = extractJsonArrayFromText(fullText);
  if (!jsonText) throw new Error("JSON dizi bulunamadı");

  const arr = JSON.parse(jsonText);
  if (!Array.isArray(arr)) throw new Error("JSON dizi değil");

  const target = arr.find((x) => normalizeTR(x?.istAd) === normalizeTR(TARGET_STATION));
  if (!target) throw new Error("İstasyon bulunamadı");

  const payload = {
    station_name: TARGET_STATION,
    data: target,
    fetched_at: new Date().toISOString(),
    source_url: SOURCE_URL,
  };

  cache = { ts: now, payload };
  return payload;
}

/* =======================
   API
======================= */
app.get("/api/station", async (_req, res) => {
  try {
    const data = await fetchTrabzonObject();
    const d = data.data;

    const currentWindKt = msToKnot(d.ruzgarHiz);
    addWindSample(d.denizVeriZamani, currentWindKt);

    const stats30 = getWindStatsLast30m();

    res.json({
      ...data,
      derived: {
        currentWindKt,
        label: windLabel(currentWindKt),
        thresholds: { stormKt: STORM_KT, strongStormKt: STRONG_STORM_KT },
      },
      stats: {
        maxWindKtLast30m: stats30.maxKt,
        maxWindAtIsoLast30m: stats30.maxAtIso,
        avgWindKtLast30m: stats30.avgKt,
        samplesInWindow: stats30.samples,
      },
      series: {
        windKtLast30m: getWindSeriesLast30m(180),
      },
    });
  } catch (e) {
    res.status(502).json({ error: String(e?.message || e) });
  }
});

/* =======================
   TELEGRAM KONTROL
======================= */
async function checkAndAlert() {
  try {
    const payload = await fetchTrabzonObject();
    const d = payload.data;

    const windKt = msToKnot(d.ruzgarHiz);
    addWindSample(d.denizVeriZamani, windKt);

    if (windKt === null) return;

    // aynı veri zamanında/aynı değerde tekrar göndermesin
    const key = `${d.denizVeriZamani}|${windKt.toFixed(2)}`;
    const now = Date.now();

    if (windKt >= STORM_KT && key !== lastAlertKey && now - lastAlertAt >= ALERT_COOLDOWN_MS) {
      const msg =
        `⚠️ <b>${windLabel(windKt)}</b>\n` +
        `<b>${d.istAd}</b>\n` +
        `Rüzgâr: <b>${windKt.toFixed(1)} kt</b>\n` +
        `Yön: ${d.ruzgarYon ?? "-"}°\n` +
        `Zaman: ${d.denizVeriZamani}`;

      await sendTelegram(msg);
      lastAlertAt = now;
      lastAlertKey = key;

      console.log("✅ Telegram uyarısı:", windKt.toFixed(1), "kt");
    }
  } catch (e) {
    console.error("❌ checkAndAlert hata:", e.message || e);
  }
}

/* =======================
   START
======================= */
app.listen(PORT, "127.0.0.1", () => {
  console.log(`✅ Server başladı: http://127.0.0.1:${PORT}`);
  checkAndAlert();
  setInterval(checkAndAlert, CHECK_INTERVAL_MS);
});
