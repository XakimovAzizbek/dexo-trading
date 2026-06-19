// ============================================
//  DEXO TRADING — Profile Logic
//  P/L = (joriy narx - o'rtacha sotib olish narxi) / o'rtacha narx * 100
// ============================================
import { initializeApp }  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc,
  collection, getDocs, query, where, orderBy
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
const auth = getAuth(app);
const db   = getFirestore(app);

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "login.html"; return; }
  setUserInfo(user);
  await loadProfile(user.uid);
});

function setUserInfo(user) {
  document.getElementById("user-name").textContent  = user.displayName || "Foydalanuvchi";
  document.getElementById("user-email").textContent = user.email || "—";

  const avatarEl   = document.getElementById("user-avatar");
  const initialsEl = document.getElementById("user-initials");
  if (user.photoURL) {
    avatarEl.src = user.photoURL;
    avatarEl.classList.remove("hidden");
    initialsEl.style.display = "none";
  } else {
    initialsEl.textContent = (user.displayName || user.email || "U").charAt(0).toUpperCase();
  }
}

async function loadProfile(uid) {
  try {
    // ── Foydalanuvchi balansi ──
    const userSnap = await getDoc(doc(db,"users",uid));
    if (!userSnap.exists()) return;
    const userData  = userSnap.data();
    const balance   = Number(userData.balance) || 0;
    const portfolio = userData.portfolio || {};

    document.getElementById("bal-amount").textContent = fmtUSDT(balance);

    // ── Sotib olingan aksiyalar (qty > 0) ──
    const ownedIds = Object.keys(portfolio).filter(id => Number(portfolio[id]) > 0);
    document.getElementById("stat-stocks").textContent = ownedIds.length;

    if (ownedIds.length === 0) {
      showEmptyHoldings();
      document.getElementById("portfolio-value").textContent = "$0.00 USDT";
      setPLBadge("portfolio-pl", 0);
      setPLBadge("stat-pl", 0, "stat-val");
      return;
    }

    // ── Har bir aksiyaning joriy ma'lumoti ──
    const stockDocs = {};
    for (const sid of ownedIds) {
      const sSnap = await getDoc(doc(db,"stocks",sid));
      if (sSnap.exists()) stockDocs[sid] = sSnap.data();
    }

    // ── O'rtacha sotib olish narxini transactions'dan hisoblash ──
    const avgCostMap = await calcAvgBuyPrices(uid, ownedIds);

    // ── Portfolio umumiy qiymati va P/L ──
    let totalValue = 0;
    let totalCost  = 0;
    const holdings = [];

    ownedIds.forEach(sid => {
      const qty   = Number(portfolio[sid]);
      const stock = stockDocs[sid];
      if (!stock) return;
      const curPrice = Number(stock.price) || 0;
      const avgCost  = avgCostMap[sid] || curPrice;
      const value    = qty * curPrice;
      const cost     = qty * avgCost;
      const plPct    = avgCost > 0 ? ((curPrice - avgCost) / avgCost) * 100 : 0;

      totalValue += value;
      totalCost  += cost;

      holdings.push({
        id: sid, symbol: stock.symbol, name: stock.name, emoji: stock.emoji,
        qty, curPrice, avgCost, value, plPct
      });
    });

    const overallPL = totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0;

    document.getElementById("portfolio-value").textContent = "$" + fmtUSDT(totalValue) + " USDT";
    setPLBadge("portfolio-pl", overallPL);
    setPLBadge("stat-pl", overallPL, "stat-val");

    renderHoldings(holdings);

    // ── Tranzaksiyalar soni ──
    const txSnap = await getDocs(query(collection(db,"transactions"), where("userId","==",uid)));
    document.getElementById("stat-tx").textContent = txSnap.size;

  } catch (e) {
    console.error("Profil yuklashda xatolik:", e);
  }
}

// ── O'rtacha sotib olish narxini hisoblash (weighted average) ──
async function calcAvgBuyPrices(uid, stockIds) {
  const avgMap = {};
  try {
    const snap = await getDocs(
      query(collection(db,"transactions"), where("userId","==",uid), orderBy("createdAt","asc"))
    );
    const ledger = {}; // { stockId: { totalQty, totalCost } }

    snap.forEach(d => {
      const t = d.data();
      if (!stockIds.includes(t.stockId)) return;
      if (!ledger[t.stockId]) ledger[t.stockId] = { qty: 0, cost: 0 };

      const qty   = Number(t.qty)   || 0;
      const total = Number(t.total) || 0;

      if (t.type === "buy") {
        ledger[t.stockId].qty  += qty;
        ledger[t.stockId].cost += total;
      } else if (t.type === "sell") {
        // Sotilganda qoldiq narxni proportional kamaytirish (avg cost saqlanadi)
        const avg = ledger[t.stockId].qty > 0 ? ledger[t.stockId].cost / ledger[t.stockId].qty : 0;
        ledger[t.stockId].qty  -= qty;
        ledger[t.stockId].cost -= qty * avg;
        if (ledger[t.stockId].qty < 0) ledger[t.stockId].qty = 0;
      }
    });

    Object.keys(ledger).forEach(sid => {
      const l = ledger[sid];
      avgMap[sid] = l.qty > 0 ? l.cost / l.qty : 0;
    });
  } catch (e) {
    console.warn("O'rtacha narx hisoblashda xatolik:", e.message);
  }
  return avgMap;
}

// ── Holdings ro'yxatini chizish ──
function renderHoldings(holdings) {
  const container = document.getElementById("holdings-list");
  if (holdings.length === 0) { showEmptyHoldings(); return; }

  holdings.sort((a,b) => b.value - a.value);

  container.innerHTML = "";
  holdings.forEach(h => {
    const isUp = h.plPct >= 0;
    const cls  = h.plPct === 0 ? "neutral" : isUp ? "up" : "down";
    const el = document.createElement("a");
    el.className = "holding-card";
    el.href = `chart.html?id=${h.id}`;
    el.innerHTML = `
      <div class="hc-icon">${esc(h.emoji || "📊")}</div>
      <div class="hc-info">
        <div class="hc-symbol">${esc(h.symbol)}</div>
        <div class="hc-qty">${h.qty.toFixed(8)} ${esc(h.symbol)}</div>
      </div>
      <div class="hc-right">
        <div class="hc-value">$${fmtUSDT(h.value)}</div>
        <span class="hc-pl ${cls}">${isUp?"+":""}${h.plPct.toFixed(2)}%</span>
      </div>`;
    container.appendChild(el);
  });
}

function showEmptyHoldings() {
  const container = document.getElementById("holdings-list");
  container.innerHTML = `
    <div class="empty-state">
      <svg viewBox="0 0 48 48" fill="none">
        <rect x="8" y="8" width="32" height="32" rx="4" stroke="#2d3d52" stroke-width="2"/>
        <path d="M14 28l6-8 6 6 4-5" stroke="#2d3d52" stroke-width="2" stroke-linecap="round"/>
      </svg>
      <p>Hali aksiya sotib olmagansiz</p>
      <a href="market.html">Marketga o'tish →</a>
    </div>`;
}

// ── P/L badge yangilash ──
function setPLBadge(elId, pct, baseClass) {
  const el = document.getElementById(elId);
  if (!el) return;
  const isUp = pct >= 0;
  const cls  = pct === 0 ? "neutral" : isUp ? "up" : "down";
  el.textContent = (isUp?"+":"") + pct.toFixed(2) + "%";
  if (baseClass) {
    el.className = baseClass + " " + (pct === 0 ? "" : isUp ? "up" : "down");
  } else {
    el.className = "bal-pl " + cls;
  }
}

// ── Utils ──
function fmtUSDT(n) {
  const num = Number(n) || 0;
  return num < 0.01 && num > 0 ? num.toFixed(8) : num.toFixed(2);
}
function esc(str) {
  return String(str||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
