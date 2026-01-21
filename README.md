# 🌊 Trabzon Limanı Ana Mendirek Feneri  
### Gerçek Zamanlı Rüzgâr ve Deniz Gözlem Uygulaması

Bu proje, **MGM Piri Reis (DOMGI)** verilerini kullanarak  
**Trabzon Limanı Ana Mendirek Feneri** istasyonuna ait **rüzgâr, hava ve deniz verilerini** gerçek zamanlı olarak izlemek için geliştirilmiştir.

Uygulama;
- Sunucu tarafında Node.js ile veriyi toplar ve işler
- Web arayüzünde modern bir dashboard olarak gösterir
- Kritik rüzgâr durumlarında **Telegram uyarısı** gönderir
- Son **30 dakikalık rüzgâr istatistiklerini ve grafiğini** üretir

---

## ✨ Özellikler

- 📡 **Canlı veri çekimi** (MGM Piri Reis – DOMGI)
- 🌬️ Rüzgâr hızı **m/s → knot (kt)** doğru dönüşüm
- 📊 **Son 30 dk maksimum & ortalama rüzgâr**
- 📈 **Mini rüzgâr grafiği** (son 30 dk)
- 🚨 Otomatik durum etiketi:
  - Normal
  - Fırtına
  - Kuvvetli Fırtına
- 📩 **Telegram bildirimleri** (eşik & cooldown destekli)
- 🎨 Web arayüzünde **çoklu tema desteği**
- 🔒 Node.js servis sadece `127.0.0.1` üzerinden çalışır (Nginx uyumlu)
- 📱 PWA / mobil uyumlu (iOS ana ekrana eklenebilir)

---

## 🧱 Teknoloji Yığını

### Backend
- Node.js (ESM)
- Express
- Cheerio
- Helmet
- systemd (servis olarak çalıştırma)

### Frontend
- Vanilla HTML / CSS / JavaScript
- Canvas API (grafik)
- Responsive tasarım
- Tema sistemi (Light / Dark / Sea / Night)

### Bildirim
- Telegram Bot API

---

## 📁 Proje Yapısı

trabzon-fener/
├── server.js
├── package.json
├── public/
│ └── index.html
└── README.md

