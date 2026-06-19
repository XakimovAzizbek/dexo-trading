// ============================================
//  DEXO TRADING — Withdraw Logic
//  Withdraw so'rovi yuborilganda balans ushlab qolinadi (escrow)
//  Admin tasdiqlasa — pul chiqarilgan deb hisoblanadi
//  Admin rad etsa — balans qaytariladi (admin panelda)
// ============================================
import { initializeApp }  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, runTransaction,
  addDoc, collection, query, where, orderBy, getDocs, serverTimestamp
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

const MIN_WITHDRAW = 1;

let currentUser = null;
let userBalance = 0;

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "login.html"; return; }
  currentUser = user;
  await loadBalance();
  await loadWithdrawHistory();
});

async function loadBalance() {
  try {
    const snap = await getDoc(doc(db,"users",currentUser.uid));
    if (snap.exists()) {
      userBalance = Number(snap.data().balance) || 0;
      document.getElementById("current-balance").textContent = "$" + fmt(userBalance) + " USDT";
    }
  } catch (e) { console.error(e); }
}

window.setPct = function(pct) {
  const val = userBalance * pct / 100;
  document.getElementById("withdraw-amount").value = val.toFixed(2);
};

window.submitWithdraw = async function() {
  clearMsgs();
  const network = document.getElementById("network-select").value;
  const wallet  = document.getElementById("wallet-address").value.trim();
  const amount  = parseFloat(document.getElementById("withdraw-amount").value);

  if (!wallet)              return showErr("Wallet manzilini kiriting.");
  if (!amount || amount<=0) return showErr("Miqdorni kiriting.");
  if (amount < MIN_WITHDRAW) return showErr(`Minimal withdraw miqdori $${MIN_WITHDRAW} USDT.`);
  if (amount > userBalance) return showErr("Balansingiz yetarli emas.");

  setLoad(true);

  try {
    // Balansni darhol ushlab qolish (escrow)
    const userRef = doc(db,"users",currentUser.uid);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(userRef);
      const liveBalance = Number(snap.data().balance) || 0;
      if (amount > liveBalance) throw new Error("Balans yetarli emas.");
      tx.update(userRef, { balance: liveBalance - amount });
    });

    // So'rovni yozish
    await addDoc(collection(db,"withdrawals"), {
      userId:    currentUser.uid,
      userEmail: currentUser.email,
      network,
      wallet,
      amount,
      status:    "pending",
      createdAt: serverTimestamp()
    });

    document.getElementById("wallet-address").value = "";
    document.getElementById("withdraw-amount").value = "";
    showSuccess("✅ Withdraw so'rovi yuborildi! Admin tasdiqlashini kuting.");
    await loadBalance();
    await loadWithdrawHistory();

  } catch (e) {
    showErr(e.message || "Xatolik yuz berdi.");
  }
  setLoad(false);
};

async function loadWithdrawHistory() {
  const container = document.getElementById("withdraw-history");
  try {
    const snap = await getDocs(
      query(collection(db,"withdrawals"), where("userId","==",currentUser.uid), orderBy("createdAt","desc"))
    );
    if (snap.empty) return;
    container.innerHTML = "";
    snap.forEach(d => {
      const w = d.data();
      const date = w.createdAt?.toDate
        ? w.createdAt.toDate().toLocaleString("uz-UZ",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})
        : "—";
      const statusText = w.status === "approved" ? "Yuborilgan" : w.status === "rejected" ? "Rad etilgan" : "Kutilmoqda";
      const row = document.createElement("div");
      row.className = "dep-row";
      row.innerHTML = `
        <span class="dep-status ${w.status}">${statusText}</span>
        <div class="dep-info">
          <div class="dep-amount">$${fmt(w.amount)} USDT · ${esc(w.network)}</div>
          <div class="dep-date">${date}</div>
        </div>`;
      container.appendChild(row);
    });
  } catch (e) { console.warn(e.message); }
}

function showErr(msg) {
  const el = document.getElementById("withdraw-error");
  el.textContent = msg; el.classList.add("show");
}
function showSuccess(msg) {
  const el = document.getElementById("withdraw-success");
  el.textContent = msg; el.classList.add("show");
}
function clearMsgs() {
  ["withdraw-error","withdraw-success"].forEach(id => {
    const el = document.getElementById(id);
    el.textContent = ""; el.classList.remove("show");
  });
}
function setLoad(on) {
  document.getElementById("btn-submit").disabled = on;
  document.getElementById("btn-loader").classList.toggle("hidden", !on);
  document.getElementById("btn-text").textContent = on ? "Yuborilmoqda..." : "So'rov yuborish";
}
function fmt(n) { const num = Number(n)||0; return num < 0.01 ? num.toFixed(8) : num.toFixed(2); }
function esc(str) { return String(str||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
