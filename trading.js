// ============================================
//  DEXO TRADING — Trading Logic (Binance Spot-like)
//  Minimal savdo: $1 USDT
// ============================================
import { initializeApp }  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, getDocs, doc, getDoc, onSnapshot,
  runTransaction, addDoc, query, orderBy, where, limit, serverTimestamp
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

const MIN_TRADE_USDT = 1;

let currentUser   = null;
let userBalance   = 0;
let userPortfolio = {};
let allStocks     = [];
let currentStock  = null;
let tradeMode     = "buy"; // "buy" | "sell"
let stockUnsub    = null;

// ── DOM tayyor bo'lgandan keyin event listenerlarni ulash ──
document.addEventListener("DOMContentLoaded", () => {
  const amountInput = document.getElementById("amount-input");
  if (amountInput) amountInput.addEventListener("input", updateCalculation);

  const searchInput = document.getElementById("pair-search");
  if (searchInput) searchInput.addEventListener("input", renderPairList);
});

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "login.html"; return; }
  currentUser = user;
  await loadStocks();
  await loadUserData();
  await loadHistory();

  const params = new URLSearchParams(location.search);
  const sid    = params.get("id");
  const action = params.get("action");

  if (sid) {
    selectStock(sid);
  } else if (allStocks.length > 0) {
    // Hech narsa tanlanmagan bo'lsa — birinchi aksiyani avtomatik tanlash
    selectStock(allStocks[0].id);
  }
  if (action === "sell") setTradeTab("sell");
});

// ── Aksiyalarni yuklash ───────────────────────
async function loadStocks() {
  try {
    const snap = await getDocs(query(collection(db,"stocks"), orderBy("symbol")));
    allStocks = [];
    snap.forEach(d => allStocks.push({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error("Aksiyalarni yuklashda xatolik:", e);
    allStocks = [];
  }
  renderPairList();
}

// ── Foydalanuvchi balansi ────────────────────
async function loadUserData() {
  try {
    const snap = await getDoc(doc(db,"users",currentUser.uid));
    if (!snap.exists()) return;
    const d = snap.data();
    userBalance   = Number(d.balance) || 0;
    userPortfolio = d.portfolio || {};
    document.getElementById("header-balance").textContent = "$" + fmt(userBalance);
    updateAvailable();
    renderHoldings();
  } catch (e) { console.error("Foydalanuvchi ma'lumotini yuklashda xatolik:", e); }
}

// ══════════════════════════════════════════
//  PAIR SELECTOR (dropdown)
// ══════════════════════════════════════════
window.togglePairList = function() {
  const list    = document.getElementById("pair-list");
  const chevron = document.getElementById("psb-chevron");
  list.classList.toggle("hidden");
  chevron.classList.toggle("rotated");
};

window.renderPairList = function() {
  const searchInput = document.getElementById("pair-search");
  const search    = (searchInput?.value || "").toLowerCase();
  const container = document.getElementById("pair-list-items");

  if (allStocks.length === 0) {
    container.innerHTML = `<div class="empty-state">Hali aksiya mavjud emas.<br>Admin panelda aksiya qo'shing.</div>`;
    return;
  }

  const filtered = allStocks.filter(s =>
    !search ||
    (s.symbol||"").toLowerCase().includes(search) ||
    (s.name||"").toLowerCase().includes(search)
  );

  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty-state">Aksiya topilmadi</div>`;
    return;
  }

  container.innerHTML = "";
  filtered.forEach(s => {
    const change = s.change24h || 0;
    const isUp   = change >= 0;
    const row = document.createElement("div");
    row.className = "pair-row";
    row.addEventListener("click", () => {
      selectStock(s.id);
      togglePairList();
    });
    row.innerHTML = `
      <div class="pr-icon">${esc(s.emoji||"📊")}</div>
      <div class="pr-info">
        <div class="pr-symbol">${esc(s.symbol)}</div>
        <div class="pr-name">${esc(s.name)}</div>
      </div>
      <div class="pr-right">
        <div class="pr-price">$${fmtPrice(s.price)}</div>
        <div class="pr-change ${isUp?"up":"down"}">${isUp?"+":""}${change.toFixed(2)}%</div>
      </div>`;
    container.appendChild(row);
  });
};

// ══════════════════════════════════════════
//  AKSIYA TANLASH
// ══════════════════════════════════════════
function selectStock(sid) {
  if (!sid) return;
  if (stockUnsub) { stockUnsub(); stockUnsub = null; }

  stockUnsub = onSnapshot(doc(db,"stocks",sid), (snap) => {
    if (!snap.exists()) return;
    currentStock = { id: sid, ...snap.data() };
    updatePairBar();
    updateMarketStats();
    const chartLink = document.getElementById("chart-link");
    chartLink.href = `chart.html?id=${sid}`;
    chartLink.onclick = null;
    document.getElementById("price-display").value = fmtPrice(currentStock.price);
    updateCalculation();
    updateAvailable();
    if (tradeMode === "sell") {
      document.getElementById("amount-field-label").textContent = "Miqdor (" + currentStock.symbol + ")";
      document.getElementById("amount-suffix").textContent      = currentStock.symbol;
    }
  }, (err) => {
    console.error("Aksiya kuzatishda xatolik:", err);
  });
}

function updatePairBar() {
  if (!currentStock) return;
  const s = currentStock;
  const change = s.change24h || 0;
  const isUp   = change >= 0;
  document.getElementById("psb-icon").textContent   = s.emoji || "📊";
  document.getElementById("psb-symbol").textContent = s.symbol;
  document.getElementById("ppb-price").textContent  = "$" + fmtPrice(s.price);
  const chEl = document.getElementById("ppb-change");
  chEl.textContent = (isUp?"+":"") + change.toFixed(4) + "%";
  chEl.className   = "ppb-change " + (change===0?"neutral":isUp?"up":"down");
}

function updateMarketStats() {
  if (!currentStock) return;
  const hist   = (currentStock.priceHistory||[]).filter(h=>h.ts >= Date.now()-86400000);
  const prices = hist.map(h=>h.price);
  document.getElementById("ms-high").textContent = prices.length ? "$"+fmtPrice(Math.max(...prices)) : "$"+fmtPrice(currentStock.price);
  document.getElementById("ms-low").textContent  = prices.length ? "$"+fmtPrice(Math.min(...prices)) : "$"+fmtPrice(currentStock.price);
  const change = currentStock.change24h || 0;
  const chEl = document.getElementById("ms-change");
  chEl.textContent = (change>=0?"+":"") + change.toFixed(2) + "%";
  chEl.style.color = change >= 0 ? "var(--up)" : "var(--down)";
}

// ══════════════════════════════════════════
//  BUY / SELL TAB
// ══════════════════════════════════════════
window.setTradeTab = function(mode) {
  tradeMode = mode;
  document.getElementById("tab-buy").classList.toggle("active", mode==="buy");
  document.getElementById("tab-sell").classList.toggle("active", mode==="sell");

  const btn = document.getElementById("btn-execute");
  btn.className = "btn-execute " + mode;
  document.getElementById("btn-execute-text").textContent = mode==="buy" ? "Sotib olish" : "Sotish";

  if (mode === "buy") {
    document.getElementById("amount-field-label").textContent = "Miqdor (USDT)";
    document.getElementById("amount-suffix").textContent      = "USDT";
    document.getElementById("amount-input").placeholder       = "min 1.00";
  } else {
    document.getElementById("amount-field-label").textContent = "Miqdor (" + (currentStock?.symbol||"AKSIYA") + ")";
    document.getElementById("amount-suffix").textContent      = currentStock?.symbol || "AKSIYA";
    document.getElementById("amount-input").placeholder       = "nechta sotmoqchisiz?";
  }

  document.getElementById("amount-input").value = "";
  clearMsgs();
  updateAvailable();
  updateCalculation();
};

function updateAvailable() {
  const el = document.getElementById("tp-available");
  if (tradeMode === "buy") {
    el.textContent = fmt(userBalance) + " USDT";
  } else if (currentStock) {
    const qty = Number(userPortfolio[currentStock.id]) || 0;
    el.textContent = qty.toFixed(8) + " " + currentStock.symbol;
  } else {
    el.textContent = "—";
  }
}

// ══════════════════════════════════════════
//  PERCENT BUTTONS
// ══════════════════════════════════════════
window.setPct = function(pct) {
  if (!currentStock) return;
  if (tradeMode === "buy") {
    document.getElementById("amount-input").value = (userBalance * pct/100).toFixed(2);
  } else {
    const qty = Number(userPortfolio[currentStock.id]) || 0;
    document.getElementById("amount-input").value = (qty * pct/100).toFixed(8);
  }
  updateCalculation();
};

// ══════════════════════════════════════════
//  HISOBLASH
// ══════════════════════════════════════════
function updateCalculation() {
  clearMsgs();
  if (!currentStock) { resetSummary(); return; }
  const inputEl = document.getElementById("amount-input");
  const input   = parseFloat(inputEl.value);
  if (!input || input <= 0) { resetSummary(); return; }

  const price = currentStock.price;
  let qty, total;

  if (tradeMode === "buy") {
    total = input;
    qty   = total / price;
    document.getElementById("sum-receive").textContent     = qty.toFixed(8) + " " + currentStock.symbol;
    document.getElementById("sum-total-label").textContent = "Jami to'lov:";
    document.getElementById("sum-total").textContent       = "$" + fmt(total) + " USDT";
  } else {
    qty   = input;
    total = qty * price;
    document.getElementById("sum-receive").textContent     = qty.toFixed(8) + " " + currentStock.symbol;
    document.getElementById("sum-total-label").textContent = "Olinadigan USDT:";
    document.getElementById("sum-total").textContent       = "$" + fmt(total) + " USDT";
  }
}
window.updateCalculation = updateCalculation;

function resetSummary() {
  document.getElementById("sum-receive").textContent = "—";
  document.getElementById("sum-total").textContent   = "—";
}

// ══════════════════════════════════════════
//  SAVDONI BAJARISH
// ══════════════════════════════════════════
window.executeTrade = async function() {
  clearMsgs();
  if (!currentStock) return showErr("Avval aksiya tanlang.");

  const inputVal = parseFloat(document.getElementById("amount-input").value);
  if (!inputVal || inputVal <= 0) return showErr("Miqdorni kiriting.");

  const price = currentStock.price;
  let qty, total;

  if (tradeMode === "buy") {
    total = inputVal;
    qty   = total / price;
    if (total < MIN_TRADE_USDT) return showErr(`Minimal savdo miqdori $${MIN_TRADE_USDT} USDT.`);
    if (total > userBalance)    return showErr("Balansingiz yetarli emas.");
  } else {
    qty   = inputVal;
    total = qty * price;
    const owned = Number(userPortfolio[currentStock.id]) || 0;
    if (qty > owned)              return showErr(`Sizda faqat ${owned.toFixed(8)} ${currentStock.symbol} mavjud.`);
    if (total < MIN_TRADE_USDT)   return showErr(`Minimal sotish summasi $${MIN_TRADE_USDT} USDT.`);
  }

  setBtnLoad(true);

  try {
    const userRef  = doc(db,"users",currentUser.uid);
    const stockRef = doc(db,"stocks",currentStock.id);

    await runTransaction(db, async (tx) => {
      const userSnap  = await tx.get(userRef);
      const stockSnap = await tx.get(stockRef);
      if (!userSnap.exists() || !stockSnap.exists()) throw new Error("Ma'lumot topilmadi.");

      const liveBalance   = Number(userSnap.data().balance) || 0;
      const livePortfolio = userSnap.data().portfolio || {};
      const livePrice     = stockSnap.data().price;

      if (tradeMode === "buy") {
        const liveQty  = total / livePrice;
        if (total > liveBalance) throw new Error("Balans yetarli emas.");
        const prevQty = Number(livePortfolio[currentStock.id]) || 0;
        tx.update(userRef, {
          balance: liveBalance - total,
          [`portfolio.${currentStock.id}`]: prevQty + liveQty
        });
      } else {
        const prevQty = Number(livePortfolio[currentStock.id]) || 0;
        if (qty > prevQty) throw new Error("Yetarli aksiya yo'q.");
        const liveTotal = qty * livePrice;
        tx.update(userRef, {
          balance: liveBalance + liveTotal,
          [`portfolio.${currentStock.id}`]: prevQty - qty
        });
      }
    });

    await addDoc(collection(db,"transactions"), {
      userId:    currentUser.uid,
      stockId:   currentStock.id,
      stockName: currentStock.symbol,
      type:      tradeMode,
      qty:       qty,
      price:     price,
      total:     total,
      createdAt: serverTimestamp()
    });

    document.getElementById("amount-input").value = "";
    resetSummary();
    await loadUserData();
    await loadHistory();

    showSuccess(tradeMode === "buy"
      ? `✅ ${qty.toFixed(8)} ${currentStock.symbol} sotib olindi!`
      : `✅ ${qty.toFixed(8)} ${currentStock.symbol} sotildi!`);

  } catch (e) {
    showErr(e.message || "Xatolik yuz berdi.");
  }
  setBtnLoad(false);
};

function showErr(msg) {
  const el = document.getElementById("trade-error");
  el.textContent = msg; el.classList.add("show");
}
function showSuccess(msg) {
  const el = document.getElementById("trade-success");
  el.textContent = msg; el.classList.add("show");
  setTimeout(() => { el.textContent=""; el.classList.remove("show"); }, 3500);
}
function clearMsgs() {
  ["trade-error","trade-success"].forEach(id => {
    const el = document.getElementById(id);
    el.textContent=""; el.classList.remove("show");
  });
}
function setBtnLoad(on) {
  document.getElementById("btn-execute").disabled = on;
  document.getElementById("execute-loader").classList.toggle("hidden", !on);
}

// ══════════════════════════════════════════
//  HOLDINGS
// ══════════════════════════════════════════
function renderHoldings() {
  const card = document.getElementById("holdings-card");
  const list = document.getElementById("holdings-list");
  const entries = Object.entries(userPortfolio).filter(([,q]) => Number(q) > 0);

  if (entries.length === 0) { card.style.display = "none"; return; }
  card.style.display = "";
  list.innerHTML = "";
  entries.forEach(([sid, qty]) => {
    const s   = allStocks.find(x => x.id === sid);
    const val = Number(qty) * (s?.price || 0);
    const row = document.createElement("div");
    row.className = "holding-row";
    row.innerHTML = `
      <div><div class="hr-sym">${esc(s?.symbol||sid)}</div><div class="hr-qty">${Number(qty).toFixed(8)}</div></div>
      <div class="hr-val">$${fmt(val)}</div>`;
    list.appendChild(row);
  });
}

// ══════════════════════════════════════════
//  SAVDO TARIXI
// ══════════════════════════════════════════
async function loadHistory() {
  const container = document.getElementById("trade-history");
  try {
    const snap = await getDocs(
      query(collection(db,"transactions"),
        where("userId","==",currentUser.uid), orderBy("createdAt","desc"), limit(10))
    );
    if (snap.empty) return;
    container.innerHTML = "";
    snap.forEach(d => {
      const t = d.data();
      const isBuy = t.type === "buy";
      const date  = t.createdAt?.toDate
        ? t.createdAt.toDate().toLocaleString("uz-UZ",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})
        : "—";
      const row = document.createElement("div");
      row.className = "history-row";
      row.innerHTML = `
        <span class="hist-badge ${isBuy?"buy":"sell"}">${isBuy?"BUY":"SELL"}</span>
        <div class="hist-info">
          <div class="hist-sym">${esc(t.stockName||t.stockId)}/USDT</div>
          <div class="hist-detail">${date} · ${Number(t.qty).toFixed(6)} · $${fmtPrice(t.price)}</div>
        </div>
        <div class="hist-amount ${isBuy?"buy":"sell"}">${isBuy?"-":"+"}$${fmt(t.total)}</div>`;
      container.appendChild(row);
    });
  } catch (e) { console.warn(e.message); }
}

// ══════════════════════════════════════════
//  UTILS
// ══════════════════════════════════════════
function fmt(n)      { const num = Number(n)||0; return num < 0.01 ? num.toFixed(8) : num.toFixed(2); }
function fmtPrice(n) { const num = Number(n)||0; return num < 0.01 ? num.toFixed(8) : num.toFixed(4); }
function esc(str)    { return String(str||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
