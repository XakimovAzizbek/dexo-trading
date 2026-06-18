// ============================================
//  DEXO TRADING — Market JS
// ============================================
import { initializeApp }  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, getDocs, query, orderBy }
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

let allStocks  = [];   // { id, ...data }
let activeFilter = "all";

// Auth guard
onAuthStateChanged(auth, (user) => {
  if (!user) { window.location.href = "login.html"; return; }
  loadStocks();
});

// ── Load all stocks from Firestore ───────────
async function loadStocks() {
  try {
    const snap = await getDocs(
      query(collection(db, "stocks"), orderBy("symbol"))
    );
    allStocks = [];
    snap.forEach(d => allStocks.push({ id: d.id, ...d.data() }));

    // Summary
    const upCount   = allStocks.filter(s => (s.change24h || 0) >= 0).length;
    const downCount = allStocks.length - upCount;
    document.getElementById("ms-total").textContent = allStocks.length;
    document.getElementById("ms-up").textContent    = upCount;
    document.getElementById("ms-down").textContent  = downCount;

    renderStocks();
  } catch (e) {
    console.error(e);
    document.getElementById("stocks-container").innerHTML =
      `<div class="empty-state"><p>Yuklashda xatolik yuz berdi</p></div>`;
  }
}

// ── Render ───────────────────────────────────
function renderStocks() {
  const search = document.getElementById("search-input").value.toLowerCase();
  const container = document.getElementById("stocks-container");

  let list = allStocks.filter(s => {
    const matchSearch = !search ||
      (s.symbol || "").toLowerCase().includes(search) ||
      (s.name   || "").toLowerCase().includes(search);
    const change = s.change24h || 0;
    const matchFilter =
      activeFilter === "all"  ? true :
      activeFilter === "up"   ? change >= 0 :
      /* down */                change <  0;
    return matchSearch && matchFilter;
  });

  if (list.length === 0) {
    container.innerHTML = `<div class="empty-state">
      <svg viewBox="0 0 48 48" fill="none">
        <rect x="8" y="8" width="32" height="32" rx="4" stroke="#2d3d52" stroke-width="2"/>
        <path d="M17 17l14 14M31 17L17 31" stroke="#2d3d52" stroke-width="2" stroke-linecap="round"/>
      </svg><p>Aksiya topilmadi</p></div>`;
    return;
  }

  container.innerHTML = "";
  list.forEach(s => {
    const change = s.change24h || 0;
    const isUp   = change >= 0;
    const price  = s.price || 0;

    const el = document.createElement("a");
    el.className = "stock-card";
    el.href = `chart.html?id=${s.id}`;
    el.innerHTML = `
      <div class="sc-icon">${esc(s.emoji || "📊")}</div>
      <div class="sc-info">
        <div class="sc-symbol">${esc(s.symbol)}</div>
        <div class="sc-name">${esc(s.name)}</div>
      </div>
      <div class="sc-right">
        <div class="sc-price">$${fmtPrice(price)}</div>
        <span class="sc-change ${isUp?"up":"down"}">${isUp?"+":""}${change.toFixed(2)}%</span>
      </div>`;
    container.appendChild(el);
  });
}

// ── Filter & search (global, called from HTML) ─
window.setFilter = function(f, btn) {
  activeFilter = f;
  document.querySelectorAll(".ftab").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  renderStocks();
};

window.filterStocks = function() { renderStocks(); };

// ── Utils ────────────────────────────────────
function fmtPrice(n) {
  const num = Number(n) || 0;
  return num < 0.01 ? num.toFixed(8) : num.toFixed(2);
}
function esc(str) {
  return String(str || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
