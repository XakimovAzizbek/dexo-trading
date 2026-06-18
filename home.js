// ============================================
//  DEXO TRADING — Home Page Logic
// ============================================

import { initializeApp }     from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAnalytics }      from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ── Firebase config ──────────────────────────
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
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db   = getFirestore(app);

// ── Auth tekshiruvi ──────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  await loadPage(user);
});

// ── Sahifani yuklash ─────────────────────────
async function loadPage(user) {
  setAvatar(user);
  await loadUserData(user.uid);
  await loadHotStocks();
  await loadRecentTx(user.uid);
}

// ── Avatar / initials ────────────────────────
function setAvatar(user) {
  const avatarEl   = document.getElementById("header-avatar");
  const initialsEl = document.getElementById("header-initials");

  if (user.photoURL) {
    avatarEl.src = user.photoURL;
    avatarEl.classList.remove("hidden");
    initialsEl.style.display = "none";
  } else {
    const name = user.displayName || user.email || "U";
    initialsEl.textContent = name.charAt(0).toUpperCase();
  }
}

// ── Foydalanuvchi ma'lumotlari ───────────────
async function loadUserData(uid) {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) return;

    const data = snap.data();
    const balance = data.balance || 0;
    const portfolio = data.portfolio || {};

    // Balansni ko'rsatish
    const [intPart, decPart] = formatBalance(balance);
    document.querySelector(".bal-int").textContent = intPart;
    document.querySelector(".bal-dec").textContent = "." + decPart;

    // Portfolio aksiyalar soni
    const stockCount = Object.keys(portfolio).length;
    document.getElementById("stat-stocks").textContent = stockCount;

    // Portfolio qiymatini hisoblash
    if (stockCount > 0) {
      const portfolioVal = await calcPortfolioValue(portfolio);
      document.getElementById("portfolio-value").textContent =
        "+" + formatNum(portfolioVal) + " UZS";
    }

  } catch (e) {
    console.error("User data load error:", e);
  }
}

// ── Portfolio qiymati ────────────────────────
async function calcPortfolioValue(portfolio) {
  let total = 0;
  for (const [stockId, qty] of Object.entries(portfolio)) {
    try {
      const sSnap = await getDoc(doc(db, "stocks", stockId));
      if (sSnap.exists()) {
        total += (sSnap.data().price || 0) * qty;
      }
    } catch (_) {}
  }
  return total;
}

// ── Mashhur aksiyalar ────────────────────────
async function loadHotStocks() {
  const container = document.getElementById("hot-stocks");
  try {
    const q = query(
      collection(db, "stocks"),
      orderBy("price", "desc"),
      limit(5)
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      container.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 48 48" fill="none">
            <rect x="8" y="8" width="32" height="32" rx="4" stroke="#2d3d52" stroke-width="2"/>
            <path d="M14 28l6-8 6 6 4-5" stroke="#2d3d52" stroke-width="2" stroke-linecap="round"/>
          </svg>
          <p>Hali aksiya qo'shilmagan</p>
        </div>`;
      return;
    }

    container.innerHTML = "";
    snap.forEach(docSnap => {
      const s = docSnap.data();
      const changeVal = s.change || 0;
      const isUp = changeVal >= 0;

      const el = document.createElement("a");
      el.className = "stock-item";
      el.href = "market.html";
      el.innerHTML = `
        <div class="stock-icon">${s.emoji || "📈"}</div>
        <div class="stock-info">
          <div class="stock-name">${esc(s.symbol || s.name)}</div>
          <div class="stock-company">${esc(s.name || "")}</div>
        </div>
        <div class="stock-right">
          <div class="stock-price">${formatNum(s.price || 0)} UZS</div>
          <span class="stock-change ${isUp ? "up" : "down"}">
            ${isUp ? "+" : ""}${changeVal.toFixed(2)}%
          </span>
        </div>`;
      container.appendChild(el);
    });

  } catch (e) {
    console.error("Stocks load error:", e);
    container.innerHTML = `<div class="empty-state"><p>Aksiyalarni yuklashda xatolik</p></div>`;
  }
}

// ── So'nggi tranzaksiyalar ───────────────────
async function loadRecentTx(uid) {
  const container = document.getElementById("tx-list");
  let txCount = 0;
  try {
    const q = query(
      collection(db, "transactions"),
      where("userId", "==", uid),
      orderBy("createdAt", "desc"),
      limit(5)
    );
    const snap = await getDocs(q);

    if (snap.empty) return;

    container.innerHTML = "";
    snap.forEach(docSnap => {
      const t = docSnap.data();
      const isBuy = t.type === "buy";
      txCount++;

      const date = t.createdAt?.toDate
        ? formatDate(t.createdAt.toDate())
        : "—";

      const el = document.createElement("div");
      el.className = "tx-item";
      el.innerHTML = `
        <div class="tx-icon ${isBuy ? "buy" : "sell"}">
          ${isBuy
            ? `<svg viewBox="0 0 24 24" fill="none"><path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
            : `<svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M19 12l-7 7-7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
          }
        </div>
        <div class="tx-info">
          <div class="tx-name">${esc(t.stockName || t.stockId || "Aksiya")}</div>
          <div class="tx-date">${date} · ${t.qty || 1} ta</div>
        </div>
        <div class="tx-amount ${isBuy ? "buy" : "sell"}">
          ${isBuy ? "-" : "+"}${formatNum(t.total || 0)} UZS
        </div>`;
      container.appendChild(el);
    });

    document.getElementById("stat-tx").textContent = txCount;

  } catch (e) {
    // Tranzaksiyalar yo'q yoki index yo'q — shuncha bo'lsin
    console.warn("Tx load:", e.message);
  }
}

// ── Yordamchi funksiyalar ────────────────────
function formatBalance(n) {
  const fixed = n.toFixed(2);
  const [i, d] = fixed.split(".");
  return [Number(i).toLocaleString("uz-UZ"), d];
}

function formatNum(n) {
  return Number(n).toLocaleString("uz-UZ");
}

function formatDate(d) {
  return d.toLocaleDateString("uz-UZ", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
