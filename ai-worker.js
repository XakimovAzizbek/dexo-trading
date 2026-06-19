// ============================================
//  DEXO TRADING — AI Price Update Worker
//  Separate thread - tab yopilsa ham ishlab turadi
// ============================================

let aiState = null;
let updateIntervalId = null;

// Main thread-dan message olish
self.addEventListener("message", (event) => {
  const { type, payload } = event.data;

  if (type === "START_AI") {
    aiState = payload;
    startAILoop();
    console.log("[Worker] AI started:", aiState);
  } else if (type === "STOP_AI") {
    if (updateIntervalId) clearInterval(updateIntervalId);
    aiState = null;
    console.log("[Worker] AI stopped");
    self.postMessage({ type: "AI_STOPPED" });
  } else if (type === "UPDATE_STATE") {
    aiState = payload;
    console.log("[Worker] State updated");
  }
});

// ── AI Loop - Separate Thread-da ──────────────
function startAILoop() {
  if (!aiState || !aiState.running) return;

  // Darhol update
  updateAIPrice();

  // Har 1.5 sekundda
  updateIntervalId = setInterval(() => {
    if (aiState && aiState.running) {
      updateAIPrice();
    }
  }, 1500);
}

// ── Narx Update Logikasi ──────────────────────
async function updateAIPrice() {
  if (!aiState || !aiState.running) return;

  const now = Date.now();
  const elapsed = now - aiState.startTime;
  const totalDuration = aiState.endTime - aiState.startTime;
  const progress = Math.min(elapsed / totalDuration, 1);

  // Qolgan vaqt
  const remainingMs = aiState.endTime - now;
  const remainingSeconds = Math.max(Math.ceil(remainingMs / 1000), 0);

  // AI narx hisoblash
  let currentPrice = aiState.initialPrice;
  let adjustedProgress = progress;

  // Kuchli silkinishlar
  const rand = Math.random();
  if (rand < 0.12) {
    const volatility = (Math.random() - 0.5) * 0.15;
    adjustedProgress = Math.min(progress + volatility, 1);
    adjustedProgress = Math.max(adjustedProgress, 0);
  } else if (rand < 0.25) {
    adjustedProgress = progress * 0.85;
  } else {
    adjustedProgress = progress;
  }

  if (aiState.direction === "up") {
    currentPrice = aiState.initialPrice + 
      (aiState.targetPrice - aiState.initialPrice) * adjustedProgress;
  } else {
    currentPrice = aiState.initialPrice - 
      (aiState.initialPrice - aiState.targetPrice) * adjustedProgress;
  }

  currentPrice = Math.max(currentPrice, 0.00000001);

  // Main thread-ga yubor - Firebase update uchun
  self.postMessage({
    type: "PRICE_UPDATE",
    data: {
      stockId: aiState.stockId,
      currentPrice: currentPrice,
      progress: progress,
      remainingSeconds: remainingSeconds,
      isCompleted: progress >= 1
    }
  });

  // Vaqt tugagan bo'lsa, stop
  if (progress >= 1) {
    if (updateIntervalId) clearInterval(updateIntervalId);
    aiState.running = false;
    self.postMessage({
      type: "AI_COMPLETED",
      data: {
        stockId: aiState.stockId,
        finalPrice: currentPrice
      }
    });
  }
}
