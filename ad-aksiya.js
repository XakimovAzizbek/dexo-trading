// ============================================
//  DEXO TRADING — Admin Panel Logic
// ============================================
import { initializeApp }  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, getDocs, addDoc, doc,
  updateDoc, deleteDoc, query, orderBy, serverTimestamp, arrayUnion
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

// ── Admin UIDs ro'yxati — o'zingizni UID qo'shing ──
// Firebase Console → Authentication → foydalanuvchi UID
const ADMIN_UIDS = [
  "JKAVgIBjBDQJ9CZYzAEMlD0ABKX2"   // <-- o'zingizning UID ni shu yerga qo'ying
];

let stocksCache = [];  // { id, symbol, name, emoji, price, change24h }

// ── AI NARX BOSHQARISH STATE ──
let aiPriceControlState = {
  running: false,
  stockId: null,
  direction: null,
  percentage: 0,
  duration: 0,
  startTime: null,
  endTime: null,
  initialPrice: null,
  targetPrice: null,
  intervalId: null,
  updateIntervalMs: 1500  // Har 1.5 sekundda yangilash
};

onAuthStateChanged(auth, (user) => {
  if (!user) { window.location.href = "login.html"; return; }
  if (!ADMIN_UIDS.includes(user.uid)) {
    alert("Sizda admin huquqi yo'q!");
    window.location.href = "home.html";
    return;
  }
  loadAdminStocks();
});

// ── Logout ───────────────────────────────────
document.getElementById("logout-btn").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "login.html";
});

// ── Barcha aksiyalarni yuklash ───────────────
async function loadAdminStocks() {
  try {
    const snap = await getDocs(query(collection(db, "stocks"), orderBy("symbol")));
    stocksCache = [];
    snap.forEach(d => stocksCache.push({ id: d.id, ...d.data() }));
    renderAdminList();
    populateSelect();
    populateAISelect();
  } catch (e) {
    console.error(e);
    document.getElementById("admin-stocks-list").innerHTML =
      `<div class="empty-state">Yuklashda xatolik</div>`;
  }
}

// ── Ro'yxatni chizish ────────────────────────
function renderAdminList() {
  const el = document.getElementById("admin-stocks-list");
  if (stocksCache.length === 0) {
    el.innerHTML = `<div class="empty-state">Hali aksiya yo'q</div>`;
    return;
  }
  el.innerHTML = "";
  stocksCache.forEach(s => {
    const change = s.change24h || 0;
    const isUp   = change >= 0;
    const div = document.createElement("div");
    div.className = "adm-stock";
    div.innerHTML = `
      <div class="adm-icon">${esc(s.emoji || "📊")}</div>
      <div class="adm-info">
        <div class="adm-symbol">${esc(s.symbol)} <span style="color:var(--t2);font-weight:400;font-size:12px">— ${esc(s.name)}</span></div>
        <div class="adm-price">$${fmtPrice(s.price)}</div>
      </div>
      <span class="adm-change ${isUp?"up":"down"}">${isUp?"+":""}${change.toFixed(2)}%</span>
      <button class="adm-del" onclick="deleteStock('${s.id}','${esc(s.symbol)}')">O'chirish</button>`;
    el.appendChild(div);
  });
}

// ── Select to'ldirish (narx boshqarish uchun) ─
function populateSelect() {
  const sel = document.getElementById("price-select");
  sel.innerHTML = `<option value="">— Aksiya tanlang —</option>`;
  stocksCache.forEach(s => {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = `${s.symbol} — ${s.name}`;
    sel.appendChild(opt);
  });
}

// ── Select to'ldirish (AI uchun) ──────────────
function populateAISelect() {
  const sel = document.getElementById("ai-stock-select");
  sel.innerHTML = `<option value="">— Aksiya tanlang —</option>`;
  stocksCache.forEach(s => {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = `${s.symbol} — ${s.name}`;
    sel.appendChild(opt);
  });
}

// Aksiya tanlanganda info ko'rsatish
document.getElementById("price-select").addEventListener("change", function() {
  const sid  = this.value;
  const info = document.getElementById("selected-info");
  if (!sid) { info.classList.add("hidden"); return; }
  const s = stocksCache.find(x => x.id === sid);
  if (!s) return;
  const change = s.change24h || 0;
  const isUp   = change >= 0;
  document.getElementById("si-price").textContent  = `$${fmtPrice(s.price)}`;
  document.getElementById("si-change").textContent = `${isUp?"+":""}${change.toFixed(2)}%`;
  document.getElementById("si-change").style.color = isUp ? "var(--up)" : "var(--down)";
  info.classList.remove("hidden");
});

// AI aksiya tanlanganda info ko'rsatish
document.getElementById("ai-stock-select").addEventListener("change", function() {
  const sid  = this.value;
  const info = document.getElementById("ai-selected-info");
  if (!sid) { info.classList.add("hidden"); return; }
  const s = stocksCache.find(x => x.id === sid);
  if (!s) return;
  document.getElementById("ai-si-price").textContent = `$${fmtPrice(s.price)}`;
  info.classList.remove("hidden");
});

// ── Quick pct ────────────────────────────────
window.setPct = function(val) {
  document.getElementById("pct-input").value = val;
};

window.setAIPct = function(val) {
  document.getElementById("ai-pct-input").value = val;
};

// ── AI Yo'nalish tanlash ───────────────────────
window.selectAIDirection = function(dir) {
  aiPriceControlState.direction = dir;
  document.getElementById("ai-dir-up").classList.toggle("selected", dir === "up");
  document.getElementById("ai-dir-down").classList.toggle("selected", dir === "down");
};

// ── AI NARX BOSHQARUVNI BOSHLASH ──────────────
window.startAIPriceControl = async function() {
  const stockId = document.getElementById("ai-stock-select").value;
  const duration = parseInt(document.getElementById("ai-duration-select").value);
  const percentage = parseFloat(document.getElementById("ai-pct-input").value);
  const direction = aiPriceControlState.direction;

  hideMsg("ai");

  if (!stockId) return showErr("ai", "Aksiya tanlanmagan.");
  if (!duration) return showErr("ai", "Vaqt tanlanmagan.");
  if (isNaN(percentage) || percentage <= 0) return showErr("ai", "Foiz to'g'ri kiritilmagan.");
  if (!direction) return showErr("ai", "Yo'nalish tanlanmagan.");

  const stock = stocksCache.find(s => s.id === stockId);
  if (!stock) return showErr("ai", "Aksiya topilmadi.");

  if (aiPriceControlState.running) {
    return showErr("ai", "AI allaqachon ishgacha.");
  }

  setLoad("btn-ai-start", "ai-start-loader", true);

  try {
    aiPriceControlState = {
      running: true,
      stockId: stockId,
      direction: direction,
      percentage: percentage,
      duration: duration,
      startTime: Date.now(),
      endTime: Date.now() + (duration * 1000),
      initialPrice: stock.price,
      targetPrice: direction === "up" 
        ? stock.price * (1 + percentage / 100)
        : stock.price * (1 - percentage / 100),
      intervalId: null,
      updateIntervalMs: 1500
    };

    // UI yangilash
    document.getElementById("btn-ai-start").disabled = true;
    document.getElementById("btn-ai-stop").disabled = false;
    document.getElementById("ai-stock-select").disabled = true;
    document.getElementById("ai-duration-select").disabled = true;
    document.getElementById("ai-pct-input").disabled = true;
    document.getElementById("ai-dir-up").disabled = true;
    document.getElementById("ai-dir-down").disabled = true;
    document.getElementById("ai-status").classList.remove("hidden");

    showSuccess("ai", `✅ AI narx boshqarish boshlandi: ${stock.symbol} ${direction === "up" ? "📈" : "📉"} ${percentage}%`);

    // AI loop boshlash
    runAIPriceUpdate();
    aiPriceControlState.intervalId = setInterval(runAIPriceUpdate, aiPriceControlState.updateIntervalMs);

  } catch (e) {
    showErr("ai", "Xatolik: " + e.message);
    setLoad("btn-ai-start", "ai-start-loader", false);
    aiPriceControlState.running = false;
  }
};

// ── AI NARX BOSHQARUVNI TUGATISH ──────────────
window.stopAIPriceControl = async function() {
  if (!aiPriceControlState.running) return;

  setLoad("btn-ai-stop", "ai-stop-loader", true);

  try {
    if (aiPriceControlState.intervalId) {
      clearInterval(aiPriceControlState.intervalId);
    }

    // Final narx Firebase-ga saqlash
    const stock = stocksCache.find(s => s.id === aiPriceControlState.stockId);
    if (stock) {
      const finalPrice = aiPriceControlState.targetPrice;
      const changePercent = aiPriceControlState.direction === "up" 
        ? aiPriceControlState.percentage 
        : -aiPriceControlState.percentage;

      await updateDoc(doc(db, "stocks", aiPriceControlState.stockId), {
        price: finalPrice,
        change24h: changePercent,
        priceHistory: arrayUnion({ price: finalPrice, ts: Date.now() }),
        updatedAt: serverTimestamp()
      });

      showSuccess("ai", `✅ AI narx boshqarish tugadi. Final narx: $${fmtPrice(finalPrice)}`);
      await loadAdminStocks();
    }

    // State reset
    aiPriceControlState.running = false;
    aiPriceControlState.intervalId = null;

    // UI reset
    document.getElementById("btn-ai-start").disabled = false;
    document.getElementById("btn-ai-stop").disabled = true;
    document.getElementById("ai-stock-select").disabled = false;
    document.getElementById("ai-duration-select").disabled = false;
    document.getElementById("ai-pct-input").disabled = false;
    document.getElementById("ai-dir-up").disabled = false;
    document.getElementById("ai-dir-down").disabled = false;
    document.getElementById("ai-status").classList.add("hidden");
    document.getElementById("ai-stock-select").value = "";
    document.getElementById("ai-duration-select").value = "";
    document.getElementById("ai-pct-input").value = "";
    document.getElementById("ai-dir-up").classList.remove("selected");
    document.getElementById("ai-dir-down").classList.remove("selected");
    aiPriceControlState.direction = null;

  } catch (e) {
    showErr("ai", "Tugatishda xatolik: " + e.message);
  }
  setLoad("btn-ai-stop", "ai-stop-loader", false);
};

// ── AI NARX YANGILASH LOOP ────────────────────
async function runAIPriceUpdate() {
  if (!aiPriceControlState.running) return;

  const now = Date.now();
  const elapsed = now - aiPriceControlState.startTime;
  const totalDuration = aiPriceControlState.endTime - aiPriceControlState.startTime;
  const progress = Math.min(elapsed / totalDuration, 1);

  // Qolgan vaqt hisoblash
  const remainingMs = aiPriceControlState.endTime - now;
  const remainingSeconds = Math.max(Math.ceil(remainingMs / 1000), 0);
  
  let displayTime = "";
  if (remainingSeconds >= 3600) {
    const hours = Math.floor(remainingSeconds / 3600);
    const mins = Math.floor((remainingSeconds % 3600) / 60);
    displayTime = `${hours}s ${mins}m`;
  } else if (remainingSeconds >= 60) {
    const mins = Math.floor(remainingSeconds / 60);
    const secs = remainingSeconds % 60;
    displayTime = `${mins}m ${secs}s`;
  } else {
    displayTime = `${remainingSeconds}s`;
  }
  
  document.getElementById("ai-remaining-time").textContent = displayTime;

  // AI narx hisoblash
  let currentPrice = aiPriceControlState.initialPrice;
  
  // Natural progress curve + kuchli silkinishlar
  let adjustedProgress = progress;
  
  // Ba'zida kuchli o'zgarish (silkinish) - random 10-15% imkoniyat
  const rand = Math.random();
  if (rand < 0.12) {
    // Kuchli silkinish: ± 5-15% extra
    const volatility = (Math.random() - 0.5) * 0.15;
    adjustedProgress = Math.min(progress + volatility, 1);
    adjustedProgress = Math.max(adjustedProgress, 0);
  } else if (rand < 0.25) {
    // Yoqim o'zgarish: slightly less progress
    adjustedProgress = progress * 0.85;
  } else {
    // Normal o'zgarish: smooth lerp
    adjustedProgress = progress;
  }

  if (aiPriceControlState.direction === "up") {
    currentPrice = aiPriceControlState.initialPrice + 
      (aiPriceControlState.targetPrice - aiPriceControlState.initialPrice) * adjustedProgress;
  } else {
    currentPrice = aiPriceControlState.initialPrice - 
      (aiPriceControlState.initialPrice - aiPriceControlState.targetPrice) * adjustedProgress;
  }

  // Price validation
  currentPrice = Math.max(currentPrice, 0.00000001);

  // Firebase-ga update
  try {
    const stock = stocksCache.find(s => s.id === aiPriceControlState.stockId);
    if (stock) {
      const change24h = ((currentPrice - stock.price) / stock.price) * 100;
      
      await updateDoc(doc(db, "stocks", aiPriceControlState.stockId), {
        price: currentPrice,
        priceHistory: arrayUnion({ price: currentPrice, ts: Date.now() }),
        updatedAt: serverTimestamp()
      });

      // UI status yangilash
      document.getElementById("ai-status-text").textContent = 
        `${aiPriceControlState.direction === "up" ? "📈 Ko'tarilmoqda" : "📉 Tushirilmoqda"}`;
      document.getElementById("ai-current-price").textContent = `$${fmtPrice(currentPrice)}`;
    }
  } catch (e) {
    console.error("AI update xatolik:", e);
  }

  // Vaqt tugasa, avtomatik tugatish
  if (progress >= 1) {
    await stopAIPriceControl();
  }
}

// ── AKSIYA YARATISH ──────────────────────────
window.createStock = async function() {
  const symbol = document.getElementById("new-symbol").value.trim().toUpperCase();
  const name   = document.getElementById("new-name").value.trim();
  const emoji  = document.getElementById("new-emoji").value.trim() || "📊";
  const desc   = document.getElementById("new-desc").value.trim();

  hideMsg("create");
  if (!symbol) return showErr("create", "Symbol kiritilmagan.");
  if (!name)   return showErr("create", "To'liq nomi kiritilmagan.");
  if (stocksCache.find(s => s.symbol === symbol))
    return showErr("create", `"${symbol}" allaqachon mavjud.`);

  setLoad("btn-create","create-loader",true);

  try {
    const INIT_PRICE = 0.00001;
    await addDoc(collection(db, "stocks"), {
      symbol,
      name,
      emoji,
      desc,
      price:     INIT_PRICE,
      change24h: 0,
      priceHistory: [{ price: INIT_PRICE, ts: Date.now() }],
      createdAt: serverTimestamp()
    });

    // Formni tozalash
    ["new-symbol","new-name","new-emoji","new-desc"].forEach(id => {
      document.getElementById(id).value = "";
    });

    showSuccess("create", `✅ "${symbol}" aksiyasi yaratildi! Boshlang'ich narx: $0.00001`);
    await loadAdminStocks();
  } catch (e) {
    showErr("create", "Xatolik: " + e.message);
  }
  setLoad("btn-create","create-loader",false);
};

// ── NARX O'ZGARTIRISH ────────────────────────
window.changePrice = async function(direction) {
  const sid    = document.getElementById("price-select").value;
  const pctRaw = parseFloat(document.getElementById("pct-input").value);

  hideMsg("price");

  if (!sid)          return showErr("price", "Aksiya tanlanmagan.");
  if (isNaN(pctRaw) || pctRaw <= 0)
                     return showErr("price", "Foiz to'g'ri kiritilmagan.");
  if (pctRaw > 100)  return showErr("price", "Foiz 100% dan oshmasin.");

  const s = stocksCache.find(x => x.id === sid);
  if (!s) return;

  const loadId = direction === "up" ? "up-loader" : "down-loader";
  const btnId  = direction === "up" ? "btn-up"    : "btn-down";
  setLoad(btnId, loadId, true);

  try {
    const multiplier  = direction === "up"
      ? (1 + pctRaw / 100)
      : (1 - pctRaw / 100);
    const newPrice    = Math.max(s.price * multiplier, 0.00000001);
    const newChange   = direction === "up" ? pctRaw : -pctRaw;

    await updateDoc(doc(db, "stocks", sid), {
      price:        newPrice,
      change24h:    newChange,
      priceHistory: arrayUnion({ price: newPrice, ts: Date.now() }),
      updatedAt:    serverTimestamp()
    });

    const arrow = direction === "up" ? "▲" : "▼";
    showSuccess("price",
      `${arrow} ${s.symbol} narxi ${pctRaw}% ${direction==="up"?"ko'tarildi":"tushirildi"} → $${fmtPrice(newPrice)}`);
    await loadAdminStocks();

    // select'ni yangilash
    document.getElementById("price-select").value = sid;
    document.getElementById("price-select").dispatchEvent(new Event("change"));
  } catch (e) {
    showErr("price", "Xatolik: " + e.message);
  }
  setLoad(btnId, loadId, false);
};

// ── AKSIYA O'CHIRISH ─────────────────────────
window.deleteStock = async function(id, symbol) {
  if (!confirm(`"${symbol}" aksiyasini o'chirishni xohlaysizmi?`)) return;
  try {
    await deleteDoc(doc(db, "stocks", id));
    await loadAdminStocks();
  } catch (e) {
    alert("O'chirishda xatolik: " + e.message);
  }
};

// ── Utils ────────────────────────────────────
function setLoad(btnId, loaderId, on) {
  const btn = document.getElementById(btnId);
  const ldr = document.getElementById(loaderId);
  if (btn) btn.disabled = on;
  if (ldr) ldr.classList.toggle("hidden", !on);
}
function showErr(ctx, msg) {
  const el = document.getElementById(`${ctx}-error`);
  if (el) { el.textContent = msg; el.classList.add("show"); }
}
function showSuccess(ctx, msg) {
  const el = document.getElementById(`${ctx}-success`);
  if (el) { el.textContent = msg; el.classList.add("show"); }
}
function hideMsg(ctx) {
  ["error","success"].forEach(t => {
    const el = document.getElementById(`${ctx}-${t}`);
    if (el) { el.textContent = ""; el.classList.remove("show"); }
  });
}
function fmtPrice(n) {
  const num = Number(n) || 0;
  return num < 0.01 ? num.toFixed(8) : num.toFixed(4);
}
function esc(str) {
  return String(str||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
