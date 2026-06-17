// ============================================
//  DEXO TRADING — Login (Google Sign-In only)
//  Firebase v10 modular SDK
// ============================================

import { initializeApp }        from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAnalytics }         from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ── Firebase config ──────────────────────────
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

const app      = initializeApp(firebaseConfig);
const analytics= getAnalytics(app);
const auth     = getAuth(app);
const db       = getFirestore(app);
const provider = new GoogleAuthProvider();

// ── Agar foydalanuvchi allaqachon login bo'lgan bo'lsa → home.html ──
onAuthStateChanged(auth, (user) => {
  if (user) {
    window.location.href = "home.html";
  }
});

// ── Error ko'rsatish ─────────────────────────
function showError(msg) {
  const el = document.getElementById("error-msg");
  el.textContent = msg;
  el.classList.add("show");
}

function hideError() {
  const el = document.getElementById("error-msg");
  el.classList.remove("show");
}

// ── Loading holati ───────────────────────────
function setLoading(on) {
  const btn    = document.getElementById("btn-google");
  const text   = btn.querySelector(".btn-google-text");
  const loader = document.getElementById("google-loader");
  btn.disabled = on;
  text.textContent = on ? "Yuklanmoqda..." : "Google orqali kirish";
  loader.classList.toggle("hidden", !on);
}

// ── Google bilan kirish ──────────────────────
window.handleGoogleLogin = async function () {
  hideError();
  setLoading(true);

  try {
    const result = await signInWithPopup(auth, provider);
    const user   = result.user;

    // Firestore'da foydalanuvchi bor-yo'qligini tekshirish
    const userRef  = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      // Yangi foydalanuvchi — Firestore'ga yozish
      await setDoc(userRef, {
        uid:       user.uid,
        name:      user.displayName || "Foydalanuvchi",
        email:     user.email,
        photoURL:  user.photoURL || "",
        balance:   0,           // boshlang'ich balans (so'mda yoki admin belgilagan valyutada)
        role:      "user",      // "user" yoki "admin"
        portfolio: {},          // sotib olingan aksiyalar: { aksiyaId: miqdor }
        createdAt: serverTimestamp()
      });
    }

    // onAuthStateChanged → home.html ga yo'naltiradi

  } catch (err) {
    setLoading(false);

    // Xato turlariga qarab xabar
    const errMap = {
      "auth/popup-closed-by-user":      "Google oynasi yopildi. Qayta urinib ko'ring.",
      "auth/popup-blocked":             "Brauzer popup'ni blokladi. Ruxsat bering.",
      "auth/network-request-failed":    "Internet aloqasi yo'q.",
      "auth/cancelled-popup-request":   "So'rov bekor qilindi.",
      "auth/account-exists-with-different-credential": "Bu email boshqa usul bilan bog'liq.",
    };

    showError(errMap[err.code] || "Xatolik yuz berdi. Qayta urinib ko'ring.");
    console.error("Google login error:", err.code, err.message);
  }
};
