// ============================================
//  DEXO TRADING — Chart Page Logic
// ============================================
import { initializeApp }  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey:            "AIzaSyBPTYL-3jOhcLi9UkjQWmSG6ArRVio5QKE",
  authDomain:        "loyiha-98a22.firebaseapp.com",
  databaseURL:       "https://loyiha-98a22-default-rtdb.firebaseio.com",
  projectId:         "loyiha-98a22",
  storageBucket:     "loyiha-98a22.firebasestorage.app",
  messagingSenderId: "1022023262123",
  appId:             "1:1022023262123:web:93294c9da118f16480fcee",
  measurementId:     "G-9DPJKJ0JYM"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// URL dan stock ID olish
const params  = new URLSearchParams(location.search);
const stockId = params.get("id");

window.getStockId = () => stockId || "";

onAuthStateChanged(auth, (user) => {
  if (!user) { window.location.href = "login.html"; return; }
  if (!stockId) { alert("Aksiya ID topilmadi!"); history.back(); return; }
  loadStock();
});

async function loadStock() {
  try {
    const snap = await getDoc(doc(db, "stocks", stockId));
    if (!snap.exists()) {
      alert("Aksiya topilmadi!"); history.back(); return;
    }
    const s = snap.data();
    renderPage(s);
  } catch (e) {
    console.error(e);
  }
}

function renderPage(s) {
  const change = s.change24h || 0;
  const isUp   = change >= 0;
  const history = (s.priceHistory || []).sort((a,b) => a.ts - b.ts);

  // Header
  document.getElementById("hs-symbol").textContent = s.symbol || "—";
  document.getElementById("hs-name").textContent   = s.name || "";
  document.title = `DEXO — ${s.symbol}`;

  // Price hero
  document.getElementById("ph-price").textContent = "$" + fmtPrice(s.price);
  const changeEl = document.getElementById("ph-change");
  changeEl.textContent = (isUp?"+":"") + change.toFixed(2) + "%";
  changeEl.className   = "ph-change " + (change === 0 ? "neutral" : isUp ? "up" : "down");

  // Stats
  const prices = history.map(h => h.price);
  document.getElementById("sb-init").textContent  = "$" + fmtPrice(history[0]?.price || s.price);
  document.getElementById("sb-high").textContent  = prices.length ? "$" + fmtPrice(Math.max(...prices)) : "—";
  document.getElementById("sb-low").textContent   = prices.length ? "$" + fmtPrice(Math.min(...prices)) : "—";
  document.getElementById("sb-count").textContent = Math.max(0, prices.length - 1);

  // Info card
  if (s.desc) {
    document.getElementById("info-card").textContent = s.desc;
  }

  // Chart
  if (history.length < 2) {
    document.getElementById("chart-empty").classList.remove("hidden");
    document.getElementById("price-chart").style.display = "none";
  } else {
    drawChart(history, isUp);
  }
}

function drawChart(history, isUp) {
  const labels = history.map(h => {
    const d = new Date(h.ts);
    return d.toLocaleDateString("uz-UZ", { month:"short", day:"numeric" })
      + " " + d.toLocaleTimeString("uz-UZ", { hour:"2-digit", minute:"2-digit" });
  });
  const prices = history.map(h => h.price);

  const color = isUp ? "#00c896" : "#f04f5a";
  const colorDim = isUp ? "#00c89620" : "#f04f5a20";

  const ctx = document.getElementById("price-chart").getContext("2d");

  // Gradient fill
  const gradient = ctx.createLinearGradient(0, 0, 0, 200);
  gradient.addColorStop(0, isUp ? "#00c89640" : "#f04f5a40");
  gradient.addColorStop(1, "transparent");

  new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        data: prices,
        borderColor: color,
        borderWidth: 2.5,
        backgroundColor: gradient,
        fill: true,
        tension: 0.4,
        pointRadius: prices.length > 10 ? 0 : 4,
        pointBackgroundColor: color,
        pointBorderColor: "#080c14",
        pointBorderWidth: 2,
        pointHoverRadius: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#0d1420",
          borderColor: "#1e2d42",
          borderWidth: 1,
          titleColor: "#8a95a8",
          bodyColor: "#e8edf5",
          titleFont: { family: "'JetBrains Mono'" },
          bodyFont:  { family: "'JetBrains Mono'", size: 14, weight: "700" },
          callbacks: {
            label: ctx => "$" + fmtPrice(ctx.parsed.y)
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: "#3d4f64",
            font: { family: "'JetBrains Mono'", size: 10 },
            maxTicksLimit: 6,
            maxRotation: 0,
          },
          grid: { color: "#1e2d4250" },
          border: { color: "#1e2d42" }
        },
        y: {
          position: "right",
          ticks: {
            color: "#3d4f64",
            font: { family: "'JetBrains Mono'", size: 10 },
            callback: v => "$" + fmtPrice(v),
          },
          grid: { color: "#1e2d4250" },
          border: { color: "#1e2d42" }
        }
      }
    }
  });
}

// ── Utils ────────────────────────────────────
function fmtPrice(n) {
  const num = Number(n) || 0;
  return num < 0.01 ? num.toFixed(8) : num.toFixed(4);
}
