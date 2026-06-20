// ============================================
//  DEXO TRADING — Balans Boshqaruvi (Admin Panel)
//  Gmail orqali foydalanuvchi qidirish + balans qo'shish/ayirish
// ============================================
import { initializeApp }  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, updateDoc, increment,
  collection, addDoc, getDocs, query, where, orderBy, limit, serverTimestamp
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
const ADMIN_UIDS = [
  "JKAVgIBjBDQJ9CZYzAEMlD0ABKX2"
];

let adminUid = null;
let foundUser = null; // { uid, email, name, balance }

onAuthStateChanged(auth, (user) => {
  if (!user) { window.location.href = "login.html"; return; }
  if (!ADMIN_UIDS.includes(user.uid)) {
    alert("Sizda admin huquqi yo'q!");
    window.location.href = "home.html";
    return;
  }
  adminUid = user.uid;
  loadHistory();
});

// ── Logout ───────────────────────────────────
document.getElementById("logout-btn").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "login.html";
});

// ── FOYDALANUVCHINI GMAIL BO'YICHA QIDIRISH ──
window.searchUser = async function() {
  const emailRaw = document.getElementById("search-email").value.trim();
  const email = emailRaw.toLowerCase();

  hideErr("search-error");
  document.getElementById("user-card").classList.add("hidden");
  foundUser = null;

  if (!email) return showErr("search-error", "Email kiritilmagan.");
  if (!email.includes("@")) return showErr("search-error", "To'g'ri email kiriting.");

  setLoad("btn-search", "search-loader", true);

  try {
    const snap = await getDocs(
      query(collection(db, "users"), where("email", "==", email), limit(1))
    );

    if (snap.empty) {
      showErr("search-error", `"${emailRaw}" bilan foydalanuvchi topilmadi.`);
      setLoad("btn-search", "search-loader", false);
      return;
    }

    const userDoc = snap.docs[0];
    const data = userDoc.data();

    foundUser = {
      uid: userDoc.id,
      email: data.email || emailRaw,
      name: data.displayName || data.name || "Foydalanuvchi",
      balance: Number(data.balance) || 0
    };

    renderFoundUser();
    document.getElementById("user-card").classList.remove("hidden");

  } catch (e) {
    showErr("search-error", "Qidirishda xatolik: " + e.message);
  }
  setLoad("btn-search", "search-loader", false);
};

function renderFoundUser() {
  document.getElementById("uf-avatar").textContent = foundUser.name.charAt(0).toUpperCase();
  document.getElementById("uf-name").textContent  = foundUser.name;
  document.getElementById("uf-email").textContent = foundUser.email;
  document.getElementById("uf-uid").textContent   = "UID: " + foundUser.uid;
  document.getElementById("bd-amount").textContent = fmtUSDT(foundUser.balance);
  hideErr("action-error");
  document.getElementById("action-success").classList.remove("show");
  document.getElementById("amount-input").value = "";
}

// ── Tezkor miqdor tugmalari ──────────────────
window.setAmount = function(val) {
  document.getElementById("amount-input").value = val;
};

// ── BALANSGA QO'SHISH / AYIRISH ──────────────
window.adjustBalance = async function(type) {
  if (!foundUser) return;

  const amount = parseFloat(document.getElementById("amount-input").value);
  hideErr("action-error");

  if (isNaN(amount) || amount <= 0) {
    return showErr("action-error", "Miqdorni to'g'ri kiriting.");
  }

  if (type === "subtract" && amount > foundUser.balance) {
    return showErr("action-error", "Balansda yetarli mablag' yo'q.");
  }

  const btnId  = type === "add" ? "btn-add" : "btn-subtract";
  const loadId = type === "add" ? "add-loader" : "subtract-loader";
  setLoad(btnId, loadId, true);

  try {
    const delta = type === "add" ? amount : -amount;
    const previousBalance = foundUser.balance;
    const newBalance = previousBalance + delta;

    // Foydalanuvchi balansini yangilash
    await updateDoc(doc(db, "users", foundUser.uid), {
      balance: increment(delta)
    });

    // Audit log — bajarilgan amalni yozib qo'yish
    await addDoc(collection(db, "balance_adjustments"), {
      userId: foundUser.uid,
      userEmail: foundUser.email,
      type: type,
      amount: amount,
      previousBalance: previousBalance,
      newBalance: newBalance,
      adminUid: adminUid,
      createdAt: serverTimestamp()
    });

    // Local state yangilash
    foundUser.balance = newBalance;
    document.getElementById("bd-amount").textContent = fmtUSDT(foundUser.balance);
    document.getElementById("amount-input").value = "";

    const verb = type === "add" ? "qo'shildi" : "ayirildi";
    showSuccess("action-success",
      `✅ $${fmtUSDT(amount)} USDT ${verb}. Yangi balans: $${fmtUSDT(newBalance)}`);

    await loadHistory();

  } catch (e) {
    showErr("action-error", "Xatolik: " + e.message);
  }
  setLoad(btnId, loadId, false);
};

// ── OXIRGI AMALLAR TARIXI ────────────────────
async function loadHistory() {
  const container = document.getElementById("history-list");
  try {
    const snap = await getDocs(
      query(collection(db, "balance_adjustments"), orderBy("createdAt", "desc"), limit(20))
    );

    if (snap.empty) {
      container.innerHTML = `<div class="empty-state">Hali amallar mavjud emas</div>`;
      return;
    }

    container.innerHTML = "";
    snap.forEach(d => {
      const h = d.data();
      const isAdd = h.type === "add";
      const date = h.createdAt?.toDate ? fmtDate(h.createdAt.toDate()) : "—";

      const el = document.createElement("div");
      el.className = "hist-row";
      el.innerHTML = `
        <div class="hr-icon ${isAdd ? "add" : "subtract"}">
          ${isAdd
            ? `<svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>`
            : `<svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>`}
        </div>
        <div class="hr-info">
          <div class="hr-email">${esc(h.userEmail || h.userId)}</div>
          <div class="hr-date">${date}</div>
        </div>
        <div class="hr-amount ${isAdd ? "add" : "subtract"}">
          ${isAdd ? "+" : "−"}$${fmtUSDT(h.amount)}
        </div>`;
      container.appendChild(el);
    });

  } catch (e) {
    console.error(e);
    container.innerHTML = `<div class="empty-state">Yuklashda xatolik</div>`;
  }
}

// ── Utils ────────────────────────────────────
function setLoad(btnId, loaderId, on) {
  const btn = document.getElementById(btnId);
  const ldr = document.getElementById(loaderId);
  if (btn) btn.disabled = on;
  if (ldr) ldr.classList.toggle("hidden", !on);
}
function showErr(elId, msg) {
  const el = document.getElementById(elId);
  el.textContent = msg;
  el.classList.add("show");
}
function hideErr(elId) {
  const el = document.getElementById(elId);
  el.textContent = "";
  el.classList.remove("show");
}
function showSuccess(elId, msg) {
  const el = document.getElementById(elId);
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 5000);
}
function fmtUSDT(n) {
  const num = Number(n) || 0;
  return num < 0.01 && num > 0 ? num.toFixed(8) : num.toFixed(2);
}
function fmtDate(d) {
  return d.toLocaleDateString("uz-UZ", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
function esc(str) {
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
