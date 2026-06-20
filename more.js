// ============================================
//  DEXO TRADING — More Page Logic
// ============================================
import { initializeApp }  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

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

onAuthStateChanged(auth, (user) => {
  if (!user) { window.location.href = "login.html"; return; }
  setUserInfo(user);
  restoreNotifPref();
});

function setUserInfo(user) {
  document.getElementById("user-name").textContent  = user.displayName || "Foydalanuvchi";
  document.getElementById("user-email").textContent = user.email || "—";

  const initial = (user.displayName || user.email || "U").charAt(0).toUpperCase();

  [["header-avatar","header-initials"], ["user-avatar","user-initials"]].forEach(([imgId, initId]) => {
    const imgEl  = document.getElementById(imgId);
    const initEl = document.getElementById(initId);
    if (user.photoURL) {
      imgEl.src = user.photoURL;
      imgEl.classList.remove("hidden");
      initEl.style.display = "none";
    } else {
      initEl.textContent = initial;
    }
  });
}

// ── Bildirishnomalar toggle (local preference) ──
function restoreNotifPref() {
  const on = localStorage.getItem("dexo_notif_pref") !== "off";
  document.getElementById("notif-toggle").classList.toggle("on", on);
}

window.toggleNotifications = function(btn) {
  const toggle = document.getElementById("notif-toggle");
  const isOn = toggle.classList.toggle("on");
  localStorage.setItem("dexo_notif_pref", isOn ? "on" : "off");
};

// ── Logout ───────────────────────────────────
document.getElementById("logout-btn").addEventListener("click", async () => {
  if (!confirm("Hisobdan chiqishni xohlaysizmi?")) return;
  await signOut(auth);
  window.location.href = "login.html";
});
