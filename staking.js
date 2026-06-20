// ============================================
//  DEXO TRADING — Staking Page Logic (v2)
//  Faqat 10% yillik APY · Daromad har sekund o'sadi
//  Claim har 24 soatda · Cheksiz qo'shish (min 5 USDT)
// ============================================
import { initializeApp }  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, increment
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

// ── KONSTANTALAR ────────────────────────────
const APY = 10;                              // Yillik foiz — FAQAT shu
const MIN_ADD = 5;                            // Minimal qo'shish miqdori (USDT)
const CLAIM_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 soat
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const RATE_PER_MS = (APY / 100) / YEAR_MS;    // Millisekundiga foiz koeffitsiyenti

let myUid = null;
let currentBalance = 0;
let tickInterval = null;

// Staking account state (Firestore: staking_accounts/{uid})
let account = {
  exists: false,
  principal: 0,
  accruedReward: 0,
  lastUpdateTime: Date.now(),
  lastClaimTime: Date.now(),
  totalClaimed: 0,
  createdAt: Date.now()
};

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "login.html"; return; }
  myUid = user.uid;
  await loadBalance();
  await loadAccount();

  renderLive();
  tickInterval = setInterval(renderLive, 1000); // Har sekund — faqat UI, Firestore-ga yozmaydi
});

window.addEventListener("beforeunload", () => {
  if (tickInterval) clearInterval(tickInterval);
});

// ── Balansni yuklash ───────────────────────────
async function loadBalance() {
  try {
    const snap = await getDoc(doc(db, "users", myUid));
    if (!snap.exists()) return;
    currentBalance = Number(snap.data().balance) || 0;
    document.getElementById("bh-amount").textContent = fmtUSDT(currentBalance);
  } catch (e) {
    console.error("Balans yuklashda xatolik:", e);
  }
}

// ── Staking account-ni yuklash ─────────────────
async function loadAccount() {
  try {
    const snap = await getDoc(doc(db, "staking_accounts", myUid));
    if (snap.exists()) {
      const d = snap.data();
      account = {
        exists: true,
        principal:      Number(d.principal) || 0,
        accruedReward:  Number(d.accruedReward) || 0,
        lastUpdateTime: Number(d.lastUpdateTime) || Date.now(),
        lastClaimTime:  Number(d.lastClaimTime) || Date.now(),
        totalClaimed:   Number(d.totalClaimed) || 0,
        createdAt:      Number(d.createdAt) || Date.now()
      };
      document.getElementById("smc-date").textContent = fmtDate(account.createdAt);
    } else {
      account.exists = false;
      document.getElementById("smc-date").textContent = "—";
    }
  } catch (e) {
    console.error("Staking account yuklashda xatolik:", e);
  }
}

// ── Joriy jamlangan daromadni hisoblash (live) ──
function calcLiveReward(now) {
  if (account.principal <= 0) return account.accruedReward;
  const pending = account.principal * RATE_PER_MS * (now - account.lastUpdateTime);
  return account.accruedReward + Math.max(pending, 0);
}

// ── Har sekundda UI yangilash ──────────────────
function renderLive() {
  const now = Date.now();
  const liveReward = calcLiveReward(now);

  document.getElementById("smc-principal").textContent = "$" + fmtUSDT(account.principal);
  document.getElementById("smc-reward-live").textContent = "$" + liveReward.toFixed(8);
  document.getElementById("sb-claimed").textContent = "$" + fmtUSDT(account.totalClaimed);

  const dailyEstimate = account.principal * (APY / 100) / 365;
  document.getElementById("sb-daily").textContent = "$" + fmtUSDT(dailyEstimate);

  const statusEl = document.getElementById("smc-status");
  if (account.principal > 0) {
    statusEl.textContent = "Faol";
    statusEl.classList.add("active");
  } else {
    statusEl.textContent = "Faol emas";
    statusEl.classList.remove("active");
  }

  // Claim tugmasi holati
  const sinceLastClaim = now - account.lastClaimTime;
  const canClaimByTime = sinceLastClaim >= CLAIM_COOLDOWN_MS;
  const hasReward = liveReward > 0.00000001;

  const claimBtn  = document.getElementById("btn-claim");
  const claimText = document.getElementById("claim-btn-text");
  const claimHint = document.getElementById("claim-hint");

  if (!hasReward) {
    claimBtn.disabled = true;
    claimText.textContent = "Daromad yo'q";
    claimHint.textContent = "Mablag' qo'shing va daromad yig'ila boshlaydi";
  } else if (!canClaimByTime) {
    claimBtn.disabled = true;
    const remaining = CLAIM_COOLDOWN_MS - sinceLastClaim;
    claimText.textContent = "Kutilmoqda";
    claimHint.textContent = `Keyingi claim: ${formatRemaining(remaining)}`;
  } else {
    claimBtn.disabled = false;
    claimText.textContent = `$${liveReward.toFixed(8)} olish`;
    claimHint.textContent = "Daromadingizni hisobingizga o'tkazing";
  }
}

// ── MAX tugmasi ─────────────────────────────────
window.setMaxAmount = function() {
  document.getElementById("add-amount").value = currentBalance.toFixed(2);
  updateAddEstimate();
};

document.getElementById("add-amount").addEventListener("input", updateAddEstimate);

function updateAddEstimate() {
  const amount = parseFloat(document.getElementById("add-amount").value) || 0;
  if (amount <= 0) {
    document.getElementById("sf-estimate").innerHTML =
      `Minimal qo'shish miqdori: <b>5 USDT</b>`;
    return;
  }
  const newPrincipal = account.principal + amount;
  const dailyEstimate = newPrincipal * (APY / 100) / 365;
  document.getElementById("sf-estimate").innerHTML =
    `Qo'shgandan keyin kunlik daromad: <b>$${fmtUSDT(dailyEstimate)}</b>`;
}

// ── Mablag' qo'shish (cheksiz marta, min 5 USDT) ──
window.addFunds = async function() {
  const amount = parseFloat(document.getElementById("add-amount").value);

  hideMsg();

  if (isNaN(amount) || amount <= 0) return showErr("Miqdorni to'g'ri kiriting.");
  if (amount < MIN_ADD) return showErr(`Minimal qo'shish miqdori: ${MIN_ADD} USDT.`);
  if (amount > currentBalance) return showErr("Balansingizda yetarli mablag' yo'q.");

  setAddLoad(true);

  try {
    const now = Date.now();

    // Joriy daromadni "bank"ga o'tkazish (principal o'zgarishidan oldin)
    const pending = account.exists
      ? account.principal * RATE_PER_MS * (now - account.lastUpdateTime)
      : 0;

    const updatedAccount = {
      principal:      account.principal + amount,
      accruedReward:  account.accruedReward + Math.max(pending, 0),
      lastUpdateTime: now,
      lastClaimTime:  account.exists ? account.lastClaimTime : now,
      totalClaimed:   account.exists ? account.totalClaimed : 0,
      createdAt:      account.exists ? account.createdAt : now
    };

    await setDoc(doc(db, "staking_accounts", myUid), updatedAccount, { merge: true });

    await updateDoc(doc(db, "users", myUid), {
      balance: increment(-amount)
    });

    // Local state yangilash
    account = { exists: true, ...updatedAccount };
    currentBalance -= amount;

    document.getElementById("bh-amount").textContent = fmtUSDT(currentBalance);
    document.getElementById("smc-date").textContent = fmtDate(account.createdAt);
    document.getElementById("add-amount").value = "";
    updateAddEstimate();
    renderLive();

    showSuccess(`✅ $${fmtUSDT(amount)} USDT staking-ga qo'shildi!`);

  } catch (e) {
    showErr("Xatolik: " + e.message);
  }
  setAddLoad(false);
};

// ── Daromadni claim qilish (har 24 soatda 1 marta) ──
window.claimReward = async function() {
  const now = Date.now();
  const sinceLastClaim = now - account.lastClaimTime;

  if (sinceLastClaim < CLAIM_COOLDOWN_MS) {
    return; // Tugma disabled bo'lishi kerak, lekin xavfsizlik uchun qayta tekshiramiz
  }

  const liveReward = calcLiveReward(now);
  if (liveReward <= 0) return;

  setClaimLoad(true);

  try {
    await updateDoc(doc(db, "users", myUid), {
      balance: increment(liveReward)
    });

    const updatedAccount = {
      principal:      account.principal,
      accruedReward:  0,
      lastUpdateTime: now,
      lastClaimTime:  now,
      totalClaimed:   account.totalClaimed + liveReward,
      createdAt:      account.createdAt
    };

    await setDoc(doc(db, "staking_accounts", myUid), updatedAccount, { merge: true });

    account = { exists: true, ...updatedAccount };
    currentBalance += liveReward;

    document.getElementById("bh-amount").textContent = fmtUSDT(currentBalance);
    renderLive();

    showSuccess(`✅ $${fmtUSDT(liveReward)} USDT hisobingizga o'tkazildi!`);

  } catch (e) {
    showErr("Claim qilishda xatolik: " + e.message);
  }
  setClaimLoad(false);
};

// ── Qolgan vaqtni formatlash (soat:min:sek) ────
function formatRemaining(ms) {
  const totalSeconds = Math.max(Math.floor(ms / 1000), 0);
  const hours   = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

// ── UI Helpers ──────────────────────────────────
function setAddLoad(on) {
  document.getElementById("btn-add").disabled = on;
  document.getElementById("add-loader").classList.toggle("hidden", !on);
}
function setClaimLoad(on) {
  document.getElementById("claim-loader").classList.toggle("hidden", !on);
}
function showErr(msg) {
  const el = document.getElementById("stake-error");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 4000);
}
function showSuccess(msg) {
  const el = document.getElementById("stake-success");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 4000);
}
function hideMsg() {
  document.getElementById("stake-error").classList.remove("show");
  document.getElementById("stake-success").classList.remove("show");
}
function fmtUSDT(n) {
  const num = Number(n) || 0;
  return num < 0.01 && num > 0 ? num.toFixed(8) : num.toFixed(2);
}
function fmtDate(ms) {
  return new Date(ms).toLocaleDateString("uz-UZ", { day: "2-digit", month: "short", year: "numeric" });
}

// Boshlang'ich estimate
updateAddEstimate();
