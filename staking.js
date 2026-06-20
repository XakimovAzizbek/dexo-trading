// ============================================
//  DEXO TRADING — Staking Page Logic
// ============================================
import { initializeApp }  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, updateDoc,
  collection, addDoc, getDocs, query, where, orderBy, serverTimestamp,
  increment
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

let myUid = null;
let currentBalance = 0;
let selectedPlan = { days: 90, apy: 25 };
let activeStakesCache = [];
let tickInterval = null;

onAuthStateChanged(auth, (user) => {
  if (!user) { window.location.href = "login.html"; return; }
  myUid = user.uid;
  loadBalance();
  loadActiveStakes();

  // Har sekundda progress/vaqtni yangilash (faqat UI, Firestore-ga yozmaydi)
  tickInterval = setInterval(renderActiveStakes, 1000);
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

// ── Reja tanlash ───────────────────────────────
window.selectPlan = function(btn) {
  document.querySelectorAll(".plan-card").forEach(c => c.classList.remove("active"));
  btn.classList.add("active");
  selectedPlan = {
    days: parseInt(btn.dataset.days),
    apy: parseFloat(btn.dataset.apy)
  };
  updateEstimate();
};

// ── Max miqdorni qo'yish ───────────────────────
window.setMaxAmount = function() {
  document.getElementById("stake-amount").value = currentBalance.toFixed(2);
  updateEstimate();
};

document.getElementById("stake-amount").addEventListener("input", updateEstimate);

function updateEstimate() {
  const amount = parseFloat(document.getElementById("stake-amount").value) || 0;
  const reward = calcReward(amount, selectedPlan.apy, selectedPlan.days);
  document.getElementById("sf-estimate").innerHTML =
    `Taxminiy daromad: <b>$${fmtUSDT(reward)}</b> (${selectedPlan.days} kunda)`;
}

function calcReward(amount, apy, days) {
  return amount * (apy / 100) * (days / 365);
}

// ── Stake yaratish ─────────────────────────────
window.createStake = async function() {
  const amount = parseFloat(document.getElementById("stake-amount").value);

  hideMsg();

  if (isNaN(amount) || amount <= 0) return showErr("Miqdorni to'g'ri kiriting.");
  if (amount > currentBalance) return showErr("Balansingizda yetarli mablag' yo'q.");
  if (amount < 1) return showErr("Minimal stake miqdori: 1 USDT.");

  setLoad(true);

  try {
    const now = Date.now();
    const reward = calcReward(amount, selectedPlan.apy, selectedPlan.days);
    const endTime = now + selectedPlan.days * 24 * 60 * 60 * 1000;

    // Stake yozuvini yaratish
    await addDoc(collection(db, "stakes"), {
      userId: myUid,
      amount: amount,
      apy: selectedPlan.apy,
      days: selectedPlan.days,
      reward: reward,
      startTime: now,
      endTime: endTime,
      status: "active",
      createdAt: serverTimestamp()
    });

    // Balansdan ayirish
    await updateDoc(doc(db, "users", myUid), {
      balance: increment(-amount)
    });

    currentBalance -= amount;
    document.getElementById("bh-amount").textContent = fmtUSDT(currentBalance);
    document.getElementById("stake-amount").value = "";
    updateEstimate();

    showSuccess(`✅ ${fmtUSDT(amount)} USDT muvaffaqiyatli stake qilindi!`);
    await loadActiveStakes();

  } catch (e) {
    showErr("Xatolik: " + e.message);
  }
  setLoad(false);
};

// ── Faol stakelarni yuklash ────────────────────
async function loadActiveStakes() {
  try {
    const snap = await getDocs(
      query(collection(db, "stakes"),
        where("userId", "==", myUid),
        where("status", "==", "active"),
        orderBy("startTime", "desc"))
    );

    activeStakesCache = [];
    snap.forEach(d => activeStakesCache.push({ id: d.id, ...d.data() }));

    renderActiveStakes();
    updateSummaryStats();

  } catch (e) {
    console.error("Stakelarni yuklashda xatolik:", e);
    document.getElementById("active-stakes").innerHTML =
      `<div class="empty-state"><p>Yuklashda xatolik</p></div>`;
  }
}

// ── Summary stats (Stakingda / Kutilayotgan foyda) ──
function updateSummaryStats() {
  const totalStaked = activeStakesCache.reduce((sum, s) => sum + s.amount, 0);
  const totalReward = activeStakesCache.reduce((sum, s) => sum + s.reward, 0);
  document.getElementById("sb-staked").textContent  = "$" + fmtUSDT(totalStaked);
  document.getElementById("sb-rewards").textContent = "$" + fmtUSDT(totalReward);
}

// ── Faol stakelarni chizish (har sekundda chaqiriladi) ──
function renderActiveStakes() {
  const container = document.getElementById("active-stakes");

  if (activeStakesCache.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 48 48" fill="none">
          <circle cx="24" cy="24" r="18" stroke="#2d3d52" stroke-width="2"/>
          <path d="M24 14v10l7 4" stroke="#2d3d52" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <p>Hali faol depozitingiz yo'q<br/>Yuqoridan reja tanlab boshlang</p>
      </div>`;
    return;
  }

  const now = Date.now();
  container.innerHTML = "";

  activeStakesCache.forEach(s => {
    const elapsed   = now - s.startTime;
    const total     = s.endTime - s.startTime;
    const progress  = Math.min(Math.max((elapsed / total) * 100, 0), 100);
    const isMatured = now >= s.endTime;
    const remainingMs = Math.max(s.endTime - now, 0);

    const el = document.createElement("div");
    el.className = "stake-card";
    el.innerHTML = `
      <div class="sc-top">
        <div>
          <div class="sc-amount">$${fmtUSDT(s.amount)}</div>
          <span class="sc-plan">${s.days} kun · ${s.apy}% APY</span>
        </div>
        <div class="sc-reward">
          <div class="sc-reward-label">Daromad</div>
          <div class="sc-reward-val">+$${fmtUSDT(s.reward)}</div>
        </div>
      </div>
      <div class="sc-progress-track">
        <div class="sc-progress-fill" style="width:${progress}%"></div>
      </div>
      <div class="sc-bottom">
        <span class="sc-time-left">${isMatured ? "✅ Tugadi" : formatRemaining(remainingMs)}</span>
        <button class="sc-claim-btn" ${isMatured ? "" : "disabled"} onclick="claimStake('${s.id}')">
          ${isMatured ? "Olish" : "Kutilmoqda"}
        </button>
      </div>
    `;
    container.appendChild(el);
  });
}

// ── Stakeni undirish (claim) ───────────────────
window.claimStake = async function(stakeId) {
  const stake = activeStakesCache.find(s => s.id === stakeId);
  if (!stake) return;

  const now = Date.now();
  if (now < stake.endTime) {
    return; // Hali tugamagan
  }

  try {
    const totalReturn = stake.amount + stake.reward;

    await updateDoc(doc(db, "stakes", stakeId), {
      status: "claimed",
      claimedAt: serverTimestamp()
    });

    await updateDoc(doc(db, "users", myUid), {
      balance: increment(totalReturn)
    });

    currentBalance += totalReturn;
    document.getElementById("bh-amount").textContent = fmtUSDT(currentBalance);

    showSuccess(`✅ $${fmtUSDT(totalReturn)} USDT hisobingizga qaytarildi!`);

    await loadActiveStakes();

  } catch (e) {
    showErr("Olishda xatolik: " + e.message);
  }
};

// ── Qolgan vaqtni formatlash ───────────────────
function formatRemaining(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const days    = Math.floor(totalSeconds / 86400);
  const hours   = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0)  return `${days}k ${hours}s qoldi`;
  if (hours > 0) return `${hours}s ${minutes}m qoldi`;
  if (minutes > 0) return `${minutes}m ${seconds}s qoldi`;
  return `${seconds}s qoldi`;
}

// ── UI Helpers ──────────────────────────────────
function setLoad(on) {
  document.getElementById("btn-stake").disabled = on;
  document.getElementById("stake-loader").classList.toggle("hidden", !on);
}
function showErr(msg) {
  const el = document.getElementById("stake-error");
  el.textContent = msg;
  el.classList.add("show");
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

// Boshlang'ich estimate
updateEstimate();
