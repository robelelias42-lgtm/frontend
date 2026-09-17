// Marageli (ማራጌሊ) — frontend logic
// This file only ever talks to YOUR backend API. It never touches the
// database directly — that's on purpose, see the security note in README.

const tg = window.Telegram && window.Telegram.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

// ---- Put your real deployed backend URL here once Render is live ----
const API_BASE_URL = "https://backend-pro-4t3h.onrender.com";

let currentTab = "store";       // "store" | "market" | "game"
let currentCategoryId = null;   // null = all categories
let currentSearch = "";
let currentSort = "";
let categories = [];
let searchDebounceTimer = null;

const grid = document.getElementById("grid");
const gameArea = document.getElementById("gameArea");
const categoryRow = document.getElementById("categoryRow");
const toolbar = document.querySelector(".toolbar");
const tabButtons = document.querySelectorAll(".tab");
const cardTemplate = document.getElementById("cardTemplate");
const searchInput = document.getElementById("searchInput");
const sortSelect = document.getElementById("sortSelect");

async function fetchJSON(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (tg && tg.initData) {
    headers["X-Telegram-Init-Data"] = tg.initData;
  }
  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  if (!response.ok) throw new Error(`Request failed: ${path}`);
  return response.json();
}

async function loadCategories() {
  categories = await fetchJSON("/api/categories");
  categoryRow.innerHTML = "";

  const allChip = makeChip("All", null, true);
  categoryRow.appendChild(allChip);

  categories.forEach((category) => {
    categoryRow.appendChild(makeChip(category.name, category.id, false));
  });
}

function makeChip(label, categoryId, isActive) {
  const chip = document.createElement("button");
  chip.className = "chip" + (isActive ? " active" : "");
  chip.textContent = label;
  chip.addEventListener("click", () => {
    currentCategoryId = categoryId;
    document.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    loadListings();
  });
  return chip;
}

function buildQuery() {
  const params = new URLSearchParams();
  if (currentCategoryId) params.set("category_id", currentCategoryId);
  if (currentSearch) params.set("search", currentSearch);
  if (currentSort) params.set("sort", currentSort);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

async function loadListings() {
  grid.innerHTML = `<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>`;

  try {
    const items = currentTab === "store"
      ? await fetchJSON(`/api/store${buildQuery()}`)
      : await fetchJSON(`/api/listings${buildQuery()}`);
    renderItems(items);
  } catch (err) {
    grid.innerHTML = `<p class="empty">Couldn't load items. Pull down to try again.</p>`;
  }
}

function renderItems(items) {
  grid.innerHTML = "";

  if (items.length === 0) {
    grid.innerHTML = `<p class="empty">Nothing here yet.</p>`;
    return;
  }

  items.forEach((item) => {
    const node = cardTemplate.content.cloneNode(true);
    const card = node.querySelector(".card");

    node.querySelector("img").src = `${API_BASE_URL}${item.photo_url}`;
    node.querySelector(".card-title").textContent = item.title;
    node.querySelector(".card-price").textContent = `${item.price_etb} ${item.currency}`;
    node.querySelector(".card-pickup").textContent = item.pickup_location || "";
    node.querySelector(".card-roll").textContent = `No. ${item.id}`;

    // On market / sold status
    const marketStatus = node.querySelector(".market-status");
    if (item.status === "sold") {
      marketStatus.textContent = "🔴 Sold";
      marketStatus.classList.add("sold");
    } else {
      marketStatus.textContent = "🟢 On Market";
      marketStatus.classList.add("on-market");
    }

    // Admin-only: toggle between On Market and Sold
    if (item.can_manage) {
      const toggleBtn = node.querySelector(".admin-toggle-btn");
      toggleBtn.style.display = "block";
      toggleBtn.textContent = item.status === "sold" ? "Mark as On Market" : "Mark as Sold";
      toggleBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const endpoint = item.status === "sold" ? "mark-on-market" : "mark-sold";
        try {
          await fetchJSON(`/api/listings/${item.id}/${endpoint}`, { method: "POST" });
          loadListings(); // refresh to reflect the new status everywhere
        } catch (err) { /* ignore */ }
      });
    }

    // Like / dislike
    const likeBtn = node.querySelector(".like-btn");
    const dislikeBtn = node.querySelector(".dislike-btn");
    const likeCount = node.querySelector(".like-count");
    const dislikeCount = node.querySelector(".dislike-count");
    likeCount.textContent = item.likes || 0;
    dislikeCount.textContent = item.dislikes || 0;
    if (item.my_reaction === "like") likeBtn.classList.add("active");
    if (item.my_reaction === "dislike") dislikeBtn.classList.add("active");

    likeBtn.addEventListener("click", (e) => { e.stopPropagation(); react(item.id, "like", likeBtn, dislikeBtn, likeCount, dislikeCount); });
    dislikeBtn.addEventListener("click", (e) => { e.stopPropagation(); react(item.id, "dislike", likeBtn, dislikeBtn, likeCount, dislikeCount); });

    // Share
    node.querySelector(".share-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      shareListing(item);
    });

    grid.appendChild(node);
  });
}

async function react(listingId, reaction, likeBtn, dislikeBtn, likeCount, dislikeCount) {
  if (!(tg && tg.initData)) return;
  try {
    const result = await fetchJSON(`/api/listings/${listingId}/react`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reaction }),
    });
    likeCount.textContent = result.likes;
    dislikeCount.textContent = result.dislikes;
    likeBtn.classList.toggle("active", result.my_reaction === "like");
    dislikeBtn.classList.toggle("active", result.my_reaction === "dislike");
  } catch (err) { /* ignore */ }
}

function shareListing(item) {
  const text = `${item.title} — ${item.price_etb} ${item.currency} on Marageli`;
  const url = API_BASE_URL; // Mini App entry point; swap for a deep link if you add one later
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  if (tg) {
    tg.openTelegramLink(shareUrl);
  } else {
    window.open(shareUrl, "_blank");
  }
}

// ---- Game tab (Tepi / Aman / Mizan) — read-only board view.
// Picking a number and paying for it happens in the bot chat, not here.
async function loadGames() {
  gameArea.innerHTML = `<p class="empty">Loading boards…</p>`;
  try {
    const boards = await fetchJSON("/api/games");
    renderGames(boards);
  } catch (err) {
    gameArea.innerHTML = `<p class="empty">Couldn't load the game boards.</p>`;
  }
}

function renderGames(boards) {
  gameArea.innerHTML = "";
  boards.forEach((board) => {
    const section = document.createElement("section");
    section.className = "game-board";

    const statusText = board.status === "open"
      ? "🟢 Game is opened — pick your lucky number!"
      : "⏳ Waiting for winners";

    section.innerHTML = `
      <div class="game-board-header">
        <span class="game-board-name">${board.name}</span>
        <span class="game-board-price">${board.price_etb} ${board.currency} / number</span>
      </div>
      <p class="game-board-status ${board.status}">${statusText}</p>
      <div class="number-grid"></div>
      <p class="game-note">Open the bot and tap 🎲 Games to pick a number.</p>
    `;

    const numberGrid = section.querySelector(".number-grid");
    board.numbers.forEach((n) => {
      const cell = document.createElement("div");
      cell.className = "number-cell" + (n.status === "taken" ? " taken" : "");
      cell.textContent = n.number;
      numberGrid.appendChild(cell);
    });

    gameArea.appendChild(section);
  });
}

// ---- Tabs ----
tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    tabButtons.forEach((b) => b.classList.remove("active"));
    button.classList.add("active");
    currentTab = button.dataset.tab;
    currentCategoryId = null;
    document.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
    if (categoryRow.firstChild) categoryRow.firstChild.classList.add("active");

    if (currentTab === "game") {
      grid.style.display = "none";
      categoryRow.style.display = "none";
      toolbar.style.display = "none";
      gameArea.style.display = "block";
      loadGames();
    } else {
      gameArea.style.display = "none";
      grid.style.display = "grid";
      categoryRow.style.display = currentTab === "market" ? "flex" : "none";
      toolbar.style.display = "flex";
      loadListings();
    }
  });
});

// ---- Search (debounced) ----
searchInput.addEventListener("input", () => {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    currentSearch = searchInput.value.trim();
    loadListings();
  }, 350);
});

// ---- Sort ----
sortSelect.addEventListener("change", () => {
  currentSort = sortSelect.value;
  loadListings();
});

// First load
categoryRow.style.display = "none"; // hidden on Store tab by default
loadCategories();
loadListings();
