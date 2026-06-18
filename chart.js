// ============================================
//  DEXO TRADING — Chart Page Logic
// ============================================
import { initializeApp }  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc, onSnapshot }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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

// URL dan stock ID olish
const params  = new URLSearchParams(location.search);
const stockId = params.get("id");

window.getStockId = () => stockId || "";

// Chart state
let chartState = {
  currentTimeframe: 60,     // Vaqt oralig'i (sekundda)
  candles: [],             // Sham data
  minPrice: 0,
  maxPrice: 0,
  scrollOffset: 0,         // Scroll pozitsiyasi
  candleWidth: 20,
  candleGap: 4,
  hoveredCandleIndex: -1
};

let updateInterval = null;
let snapshotUnsubscribe = null;

onAuthStateChanged(auth, (user) => {
  if (!user) { window.location.href = "login.html"; return; }
  if (!stockId) { alert("Aksiya ID topilmadi!"); history.back(); return; }
  loadStock();
});

async function loadStock() {
  try {
    const snap = await getDoc(doc(db, "stocks", stockId));
    if (!snap.exists()) {
      alert("Aksiya topilmadi!"); history.back(); return;
    }
    const s = snap.data();
    renderHeader(s);
    
    // Real-time listener
    snapshotUnsubscribe = onSnapshot(doc(db, "stocks", stockId), (newSnap) => {
      if (newSnap.exists()) {
        const updated = newSnap.data();
        updateChartData(updated);
        renderStats(updated);
      }
    });
  } catch (e) {
    console.error(e);
  }
}

function renderHeader(s) {
  document.getElementById("hs-symbol").textContent = s.symbol || "—";
  document.getElementById("hs-name").textContent   = s.name || "";
  document.title = `DEXO — ${s.symbol}`;
  
  if (s.desc) {
    document.getElementById("info-card").textContent = s.desc;
  }
  
  // Birinchi chart chizish
  updateChartData(s);
}

function updateChartData(stockData) {
  const history = (stockData.priceHistory || []).sort((a, b) => a.ts - b.ts);
  
  if (history.length < 2) {
    document.getElementById("chart-empty").classList.remove("hidden");
    document.getElementById("candlestick-chart").style.display = "none";
    return;
  }
  
  document.getElementById("chart-empty").classList.add("hidden");
  document.getElementById("candlestick-chart").style.display = "block";
  
  // Shamlarni generatsiya qilish
  generateCandles(history, chartState.currentTimeframe);
  renderCandlestickChart();
  renderStats(stockData);
}

function generateCandles(priceHistory, timeframeSeconds) {
  if (priceHistory.length < 2) {
    chartState.candles = [];
    return;
  }
  
  const candles = [];
  const startTime = priceHistory[0].ts;
  const endTime = priceHistory[priceHistory.length - 1].ts;
  
  for (let time = startTime; time <= endTime; time += timeframeSeconds * 1000) {
    const nextTime = time + timeframeSeconds * 1000;
    const candleData = priceHistory.filter(p => p.ts >= time && p.ts < nextTime);
    
    if (candleData.length > 0) {
      const prices = candleData.map(p => p.price);
      const open = candleData[0].price;
      const close = candleData[candleData.length - 1].price;
      const high = Math.max(...prices);
      const low = Math.min(...prices);
      const change = close > open ? ((close - open) / open) * 100 : ((open - close) / open) * -100;
      
      candles.push({
        time: time,
        timeLabel: formatCandleTime(time, timeframeSeconds),
        open,
        close,
        high,
        low,
        change,
        isGreen: close >= open
      });
    }
  }
  
  chartState.candles = candles;
  
  // Min/Max narxlarni hisoblash
  if (candles.length > 0) {
    const allPrices = candles.flatMap(c => [c.high, c.low]);
    chartState.minPrice = Math.min(...allPrices);
    chartState.maxPrice = Math.max(...allPrices);
    
    // Padding qo'shish
    const padding = (chartState.maxPrice - chartState.minPrice) * 0.1;
    chartState.minPrice -= padding;
    chartState.maxPrice += padding;
  }
}

function renderCandlestickChart() {
  const canvas = document.getElementById("candlestick-chart");
  if (!canvas) return;
  
  const ctx = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * window.devicePixelRatio;
  canvas.height = rect.height * window.devicePixelRatio;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  
  const canvasWidth = rect.width;
  const canvasHeight = rect.height;
  
  // Fon
  ctx.fillStyle = "transparent";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  
  // Grid chiziqlar
  drawGridLines(ctx, canvasWidth, canvasHeight);
  
  // Shamlarni chizish
  if (chartState.candles.length === 0) return;
  
  const totalCandleWidth = chartState.candles.length * (chartState.candleWidth + chartState.candleGap);
  const viewWidth = canvasWidth;
  
  // Scroll cheklovlari
  const maxScroll = Math.max(0, totalCandleWidth - viewWidth);
  chartState.scrollOffset = Math.min(chartState.scrollOffset, maxScroll);
  chartState.scrollOffset = Math.max(0, chartState.scrollOffset);
  
  // Shamlarni chizish
  let xPos = chartState.candleGap - chartState.scrollOffset;
  
  chartState.candles.forEach((candle, index) => {
    // Candle tugmaganchaga scroll qilish
    if (xPos + chartState.candleWidth > 0 && xPos < canvasWidth) {
      drawCandle(ctx, xPos, candle, canvasHeight);
      
      // Hover tooltip
      if (index === chartState.hoveredCandleIndex) {
        drawCandleTooltip(ctx, xPos, candle, canvasHeight);
      }
    }
    
    xPos += chartState.candleWidth + chartState.candleGap;
  });
  
  // Y o'qini label qilish
  updateYAxisLabels();
  updateXAxisLabels();
}

function drawCandle(ctx, x, candle, canvasHeight) {
  const padding = 20;
  const chartWidth = canvasHeight - padding * 2;
  
  const priceToY = (price) => {
    const range = chartState.maxPrice - chartState.minPrice;
    return canvasHeight - padding - ((price - chartState.minPrice) / range) * chartWidth;
  };
  
  const openY = priceToY(candle.open);
  const closeY = priceToY(candle.close);
  const highY = priceToY(candle.high);
  const lowY = priceToY(candle.low);
  
  const color = candle.isGreen ? "#00c896" : "#f04f5a";
  const bodyTop = Math.min(openY, closeY);
  const bodyBottom = Math.max(openY, closeY);
  const bodyHeight = Math.max(bodyBottom - bodyTop, 1);
  
  // Sham soyasi (high-low chiziq)
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + chartState.candleWidth / 2, highY);
  ctx.lineTo(x + chartState.candleWidth / 2, lowY);
  ctx.stroke();
  
  // Sham tanasi (open-close to'rtburchak)
  ctx.fillStyle = color;
  ctx.fillRect(x + 2, bodyTop, chartState.candleWidth - 4, bodyHeight);
  
  // Chiziq
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.5;
  ctx.strokeRect(x + 2, bodyTop, chartState.candleWidth - 4, bodyHeight);
}

function drawCandleTooltip(ctx, x, candle, canvasHeight) {
  const tooltipEl = document.getElementById("chart-tooltip");
  if (!tooltipEl) return;
  
  const canvas = document.getElementById("candlestick-chart");
  const rect = canvas.getBoundingClientRect();
  
  tooltipEl.classList.remove("hidden");
  document.getElementById("tooltip-open").textContent = "$" + fmtPrice(candle.open);
  document.getElementById("tooltip-close").textContent = "$" + fmtPrice(candle.close);
  document.getElementById("tooltip-high").textContent = "$" + fmtPrice(candle.high);
  document.getElementById("tooltip-low").textContent = "$" + fmtPrice(candle.low);
  document.getElementById("tooltip-change").textContent = candle.change.toFixed(2) + "%";
  document.getElementById("tooltip-change").style.color = candle.isGreen ? "var(--up)" : "var(--down)";
  document.getElementById("tooltip-time").textContent = candle.timeLabel;
  
  tooltipEl.style.left = (x + rect.left + chartState.candleWidth / 2 - 70) + "px";
  tooltipEl.style.top = (rect.top - 150) + "px";
}

function drawGridLines(ctx, canvasWidth, canvasHeight) {
  ctx.strokeStyle = "#1e2d4250";
  ctx.lineWidth = 0.5;
  
  // Horizontal chiziqlar
  for (let i = 0; i < 5; i++) {
    const y = (canvasHeight / 4) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvasWidth, y);
    ctx.stroke();
  }
}

function updateYAxisLabels() {
  const yAxisEl = document.getElementById("chart-y-axis");
  if (!yAxisEl) return;
  
  yAxisEl.innerHTML = "";
  for (let i = 4; i >= 0; i--) {
    const price = chartState.minPrice + (chartState.maxPrice - chartState.minPrice) * (i / 4);
    const label = document.createElement("div");
    label.textContent = "$" + fmtPrice(price);
    yAxisEl.appendChild(label);
  }
}

function updateXAxisLabels() {
  const xAxisEl = document.getElementById("chart-x-axis");
  if (!xAxisEl) return;
  
  xAxisEl.innerHTML = "";
  if (chartState.candles.length > 0) {
    const step = Math.ceil(chartState.candles.length / 5);
    for (let i = 0; i < chartState.candles.length; i += step) {
      const label = document.createElement("div");
      label.textContent = chartState.candles[i].timeLabel;
      xAxisEl.appendChild(label);
    }
  }
}

function formatCandleTime(timestamp, timeframeSeconds) {
  const date = new Date(timestamp);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  
  if (timeframeSeconds >= 86400) {
    return date.toLocaleDateString("uz-UZ", { month: "short", day: "numeric" });
  } else if (timeframeSeconds >= 3600) {
    return hours + ":" + minutes;
  } else {
    const seconds = String(date.getSeconds()).padStart(2, "0");
    return hours + ":" + minutes + ":" + seconds;
  }
}

function renderStats(stockData) {
  const history = (stockData.priceHistory || []).sort((a, b) => a.ts - b.ts);
  const change = stockData.change24h || 0;
  const isUp = change >= 0;
  
  // Price hero
  document.getElementById("ph-price").textContent = "$" + fmtPrice(stockData.price);
  const changeEl = document.getElementById("ph-change");
  changeEl.textContent = (isUp ? "+" : "") + change.toFixed(2) + "%";
  changeEl.className = "ph-change " + (change === 0 ? "neutral" : isUp ? "up" : "down");
  
  // Stats
  const prices = history.map(h => h.price);
  document.getElementById("sb-init").textContent = "$" + fmtPrice(history[0]?.price || stockData.price);
  document.getElementById("sb-high").textContent = prices.length ? "$" + fmtPrice(Math.max(...prices)) : "—";
  document.getElementById("sb-low").textContent = prices.length ? "$" + fmtPrice(Math.min(...prices)) : "—";
  document.getElementById("sb-count").textContent = chartState.candles.length;
}

// ── TIMEFRAME O'ZGARTIRISH ──────────────────
window.changeTimeframe = function(tf) {
  chartState.currentTimeframe = tf;
  chartState.scrollOffset = 0;
  chartState.hoveredCandleIndex = -1;
  
  // Tugmalarni yangilash
  document.querySelectorAll(".tf-btn").forEach(btn => {
    btn.classList.remove("active");
  });
  event.target.classList.add("active");
  
  // Chart yangilash
  const canvas = document.getElementById("candlestick-chart");
  if (canvas) {
    const history = Array.from(canvas.dataset.history ? JSON.parse(canvas.dataset.history) : []).sort((a, b) => a.ts - b.ts);
    if (history.length > 0) {
      generateCandles(history, tf);
      renderCandlestickChart();
    }
  }
};

// ── MOUSE EVENTS ────────────────────────────
const canvas = document.getElementById("candlestick-chart");

if (canvas) {
  // Mouse move - hover tooltip
  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    
    let hoveredIndex = -1;
    let xPos = chartState.candleGap - chartState.scrollOffset;
    
    for (let i = 0; i < chartState.candles.length; i++) {
      if (x >= xPos && x <= xPos + chartState.candleWidth) {
        hoveredIndex = i;
        break;
      }
      xPos += chartState.candleWidth + chartState.candleGap;
    }
    
    if (hoveredIndex !== chartState.hoveredCandleIndex) {
      chartState.hoveredCandleIndex = hoveredIndex;
      renderCandlestickChart();
    }
  });
  
  // Mouse leave - hide tooltip
  canvas.addEventListener("mouseleave", () => {
    chartState.hoveredCandleIndex = -1;
    document.getElementById("chart-tooltip").classList.add("hidden");
    renderCandlestickChart();
  });
  
  // Wheel scroll
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    chartState.scrollOffset += e.deltaX || e.deltaY * 2;
    renderCandlestickChart();
  });
  
  // Touch scroll
  let touchStartX = 0;
  canvas.addEventListener("touchstart", (e) => {
    touchStartX = e.touches[0].clientX;
  });
  
  canvas.addEventListener("touchmove", (e) => {
    e.preventDefault();
    const touchCurrentX = e.touches[0].clientX;
    const delta = touchStartX - touchCurrentX;
    chartState.scrollOffset += delta;
    touchStartX = touchCurrentX;
    renderCandlestickChart();
  });
}

// ── REAL-TIME UPDATE ────────────────────────
setInterval(() => {
  const canvas = document.getElementById("candlestick-chart");
  if (canvas && document.getElementById("candlestick-chart").style.display !== "none") {
    renderCandlestickChart();
  }
}, 500); // 0.5 sekunda

// ── Utils ────────────────────────────────────
function fmtPrice(n) {
  const num = Number(n) || 0;
  return num < 0.01 ? num.toFixed(8) : num.toFixed(4);
}

// Cleanup
window.addEventListener("beforeunload", () => {
  if (snapshotUnsubscribe) {
    snapshotUnsubscribe();
  }
});
