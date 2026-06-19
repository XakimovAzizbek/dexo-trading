// ============================================
//  DEXO TRADING — Home Page Logic (USDT)
// ============================================

import { initializeApp }  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAnalytics }   from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";
import {
  getAuth, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc,
  collection, getDocs,
  query, orderBy, limit, where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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
getAnalytics(app);
const auth = getAuth(app);
const db   = getFirestore(app);

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "login.html"; return; }
  setAvatar(user);
  await loadUserData(user.uid);
  await loadHotStocks();
  await loadRecentTx(user.uid);
});

function setAvatar(user) {
  const avatarEl   = document.getElementById("header-avatar");
  const initialsEl = document.getElementById("header-initials");
  if (user.photoURL) {
    avatarEl.src = user.photoURL;
    avatarEl.classList.remove("hidden");
    initialsEl.style.display = "none";
  } else {
    initialsEl.textContent = (user.displayName || user.email || "U").charAt(0).toUpperCase();
  }
}

async function loadUserData(uid) {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) return;
    const data     = snap.data();
    const balance  = data.balance || 0;
    const portfolio = data.portfolio || {};

    // Balans — USDT, 8 xona aniqlik
    document.querySelector(".bal-int").textContent = formatUSDT(balance);
    document.querySelector(".bal-cur").textContent = "USDT";

    const stockCount = Object.keys(portfolio).length;
    document.getElementById("stat-stocks").textContent = stockCount;

    if (stockCount > 0) {
      const pVal = await calcPortfolioValue(portfolio);
      document.getElementById("portfolio-value").textContent =
        (pVal >= 0 ? "+" : "") + formatUSDT(pVal) + " USDT";
    }
  } catch (e) { console.error(e); }
}

async function calcPortfolioValue(portfolio) {
  let total = 0;
  for (const [stockId, qty] of Object.entries(portfolio)) {
    try {
      const s = await getDoc(doc(db, "stocks", stockId));
      if (s.exists()) total += (s.data().price || 0) * qty;
    } catch (_) {}
  }
  return total;
}

async function loadHotStocks() {
  const container = document.getElementById("hot-stocks");
  try {
    const snap = await getDocs(
      query(collection(db, "stocks"), orderBy("price", "desc"), limit(5))
    );
    if (snap.empty) {
      container.innerHTML = emptyHTML("Hali aksiya qo'shilmagan"); return;
    }
    container.innerHTML = "";
    snap.forEach(d => {
      const s = d.data(); const sid = d.id;
      const change = s.change24h || 0;
      const isUp   = change >= 0;
      const el = document.createElement("a");
      el.className = "stock-item";
      el.href = `chart.html?id=${sid}`;
      el.innerHTML = `
        <div class="stock-icon">${s.emoji || "📊"}</div>
        <div class="stock-info">
          <div class="stock-name">${esc(s.symbol)}</div>
          <div class="stock-company">${esc(s.name)}</div>
        </div>
        <div class="stock-right">
          <div class="stock-price">$${formatUSDT(s.price)}</div>
          <span class="stock-change ${isUp?"up":"down"}">${isUp?"+":""}${change.toFixed(2)}%</span>
        </div>`;
      container.appendChild(el);
    });
  } catch (e) {
    container.innerHTML = emptyHTML("Yuklashda xatolik"); console.error(e);
  }
}

async function loadRecentTx(uid) {
  const container = document.getElementById("tx-list");
  try {
    const snap = await getDocs(
      query(collection(db, "transactions"),
        where("userId","==",uid), orderBy("createdAt","desc"), limit(5))
    );
    if (snap.empty) return;
    container.innerHTML = "";
    let cnt = 0;
    snap.forEach(d => {
      const t = d.data(); cnt++;
      const isBuy = t.type === "buy";
      const date  = t.createdAt?.toDate ? fmtDate(t.createdAt.toDate()) : "—";
      const el = document.createElement("div");
      el.className = "tx-item";
      el.innerHTML = `
        <div class="tx-icon ${isBuy?"buy":"sell"}">
          ${isBuy
            ? `<svg viewBox="0 0 24 24" fill="none"><path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`
            : `<svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M19 12l-7 7-7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`}
        </div>
        <div class="tx-info">
          <div class="tx-name">${esc(t.stockName || t.stockId)}</div>
          <div class="tx-date">${date} · ${t.qty} ta</div>
        </div>
        <div class="tx-amount ${isBuy?"buy":"sell"}">
          ${isBuy?"-":"+"}$${formatUSDT(t.total)}
        </div>`;
      container.appendChild(el);
    });
    document.getElementById("stat-tx").textContent = cnt;
  } catch (e) { console.warn(e.message); }
}

// ── Utils ────────────────────────────────────
function formatUSDT(n) {
  const num = Number(n) || 0;
  // 8 xona aniqlik, keraksiz nollarni kesib
  return num < 0.01 ? num.toFixed(8) : num.toFixed(2);
}
function fmtDate(d) {
  return d.toLocaleDateString("uz-UZ", {day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"});
}
function esc(str) {
  return String(str||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
function emptyHTML(msg) {
  return `<div class="empty-state"><svg viewBox="0 0 48 48" fill="none">
    <rect x="8" y="8" width="32" height="32" rx="4" stroke="#2d3d52" stroke-width="2"/>
    <path d="M14 28l6-8 6 6 4-5" stroke="#2d3d52" stroke-width="2" stroke-linecap="round"/>
  </svg><p>${msg}</p></div>`;
}