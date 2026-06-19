// ============================================
//  DEXO TRADING — Deposit Logic
//  Deposit so'rovi Firestore'ga yoziladi, admin tasdiqlaydi
// ============================================
import { initializeApp }  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, addDoc, collection,
  query, where, orderBy, getDocs, serverTimestamp
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

// ── Admin depozit manzillari (tarmoq bo'yicha) ──
// Buni o'zgartirib, haqiqiy wallet manzillaringizni qo'ying
const DEPOSIT_ADDRESSES = {
  TRC20: "TXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  BEP20: "0xXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  ERC20: "0xXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
};

let currentUser = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "login.html"; return; }
  currentUser = user;
  await loadBalance();
  updateAddress();
  await loadDepositHistory();
});

document.getElementById("network-select").addEventListener("change", updateAddress);

function updateAddress() {
  const network = document.getElementById("network-select").value;
  document.getElementById("deposit-address").textContent = DEPOSIT_ADDRESSES[network] || "—";
}

async function loadBalance() {
  try {
    const snap = await getDoc(doc(db,"users",currentUser.uid));
    if (snap.exists()) {
      const bal = Number(snap.data().balance) || 0;
      document.getElementById("current-balance").textContent = "$" + fmt(bal) + " USDT";
    }
  } catch (e) { console.error(e); }
}

window.copyAddress = function() {
  const addr = document.getElementById("deposit-address").textContent;
  navigator.clipboard.writeText(addr).then(() => {
    const msg = document.getElementById("copy-msg");
    msg.textContent = "✅ Nusxalandi!";
    setTimeout(() => { msg.textContent = ""; }, 2000);
  }).catch(() => {
    const msg = document.getElementById("copy-msg");
    msg.textContent = "Nusxalashda xatolik, qo'lda nusxalang.";
  });
};

window.submitDeposit = async function() {
  clearMsgs();
  const network = document.getElementById("network-select").value;
  const amount  = parseFloat(document.getElementById("deposit-amount").value);
  const txHash  = document.getElementById("tx-hash").value.trim();

  if (!amount || amount <= 0) return showErr("Miqdorni kiriting.");
  if (amount < 1) return showErr("Minimal depozit miqdori $1 USDT.");

  setLoad(true);
  try {
    await addDoc(collection(db,"deposits"), {
      userId:    currentUser.uid,
      userEmail: currentUser.email,
      network,
      amount,
      txHash:    txHash || null,
      status:    "pending",
      createdAt: serverTimestamp()
    });

    document.getElementById("deposit-amount").value = "";
    document.getElementById("tx-hash").value = "";
    showSuccess("✅ So'rov yuborildi! Admin tasdiqlashini kuting.");
    await loadDepositHistory();
  } catch (e) {
    showErr("Xatolik: " + e.message);
  }
  setLoad(false);
};

async function loadDepositHistory() {
  const container = document.getElementById("deposit-history");
  try {
    const snap = await getDocs(
      query(collection(db,"deposits"), where("userId","==",currentUser.uid), orderBy("createdAt","desc"))
    );
    if (snap.empty) return;
    container.innerHTML = "";
    snap.forEach(d => {
      const dep = d.data();
      const date = dep.createdAt?.toDate
        ? dep.createdAt.toDate().toLocaleString("uz-UZ",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})
        : "—";
      const statusText = dep.status === "approved" ? "Tasdiqlangan" : dep.status === "rejected" ? "Rad etilgan" : "Kutilmoqda";
      const row = document.createElement("div");
      row.className = "dep-row";
      row.innerHTML = `
        <span class="dep-status ${dep.status}">${statusText}</span>
        <div class="dep-info">
          <div class="dep-amount">$${fmt(dep.amount)} USDT · ${esc(dep.network)}</div>
          <div class="dep-date">${date}</div>
        </div>`;
      container.appendChild(row);
    });
  } catch (e) { console.warn(e.message); }
}

function showErr(msg) {
  const el = document.getElementById("deposit-error");
  el.textContent = msg; el.classList.add("show");
}
function showSuccess(msg) {
  const el = document.getElementById("deposit-success");
  el.textContent = msg; el.classList.add("show");
}
function clearMsgs() {
  ["deposit-error","deposit-success"].forEach(id => {
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
