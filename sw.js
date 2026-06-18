// ============================================
//  DEXO TRADING — Background Service Worker
//  AI rejimi tab yopilsa ham ishlab turadi
// ============================================

const CACHE_NAME = "dexo-admin-v1";
const urlsToCache = [
  "/",
  "/ad-aksiya.html",
  "/ad-aksiya.css",
  "/ad-aksiya.js"
];

// Service Worker install
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache).catch(() => {
        // Errors ignored - offline support optional
      });
    })
  );
  self.skipWaiting();
});

// Service Worker activate
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Background sync - AI rejimini davom ettirish
self.addEventListener("sync", (event) => {
  if (event.tag === "ai-price-update") {
    event.waitUntil(updateAIPriceInBackground());
  }
});

// Periodic background sync - har 30 sekundda check
self.addEventListener("periodicsync", (event) => {
  if (event.tag === "ai-check") {
    event.waitUntil(checkAIStatusInBackground());
  }
});

// Background tasks
async function updateAIPriceInBackground() {
  try {
    // IndexedDB yoki localStorage dan state olish
    const state = await getAIStateFromStorage();
    if (state && state.running) {
      // Firebase-ga update jo'natish
      await syncAIPriceUpdate(state);
    }
  } catch (e) {
    console.error("Background update error:", e);
  }
}

async function checkAIStatusInBackground() {
  try {
    const state = await getAIStateFromStorage();
    if (state && state.running) {
      const now = Date.now();
      if (now >= state.endTime) {
        // AI rejimi tugagan
        state.running = false;
        await saveAIStateToStorage(state);
      }
    }
  } catch (e) {
    console.error("Background check error:", e);
  }
}

// Storage helper
async function getAIStateFromStorage() {
  return new Promise((resolve) => {
    const req = indexedDB.open("DEXOAdmin", 1);
    req.onsuccess = () => {
      const db = req.result;
      const transaction = db.transaction("aiState", "readonly");
      const store = transaction.objectStore("aiState");
      const get = store.get("current");
      get.onsuccess = () => resolve(get.result);
      get.onerror = () => resolve(null);
    };
    req.onerror = () => resolve(null);
  });
}

async function saveAIStateToStorage(state) {
  return new Promise((resolve) => {
    const req = indexedDB.open("DEXOAdmin", 1);
    req.onsuccess = () => {
      const db = req.result;
      const transaction = db.transaction("aiState", "readwrite");
      const store = transaction.objectStore("aiState");
      store.put(state, "current");
      transaction.oncomplete = () => resolve();
    };
    req.onerror = () => resolve();
  });
}

async function syncAIPriceUpdate(state) {
  // Firebase bilan sync - actual update
  // Message send clients
  const clients = await self.clients.matchAll();
  clients.forEach((client) => {
    client.postMessage({
      type: "AI_BACKGROUND_UPDATE",
      state: state
    });
  });
}
