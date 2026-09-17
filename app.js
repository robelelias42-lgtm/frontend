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

let currentTab = "store";       // "store" | "market" | "favorites" | "mine"
let currentCategoryId = null;   // null = all categories
let currentSearch = "";
let currentSort = "";
let categories = [];
let searchDebounceTimer = null;

const grid = document.getElementById("grid");
const categoryRow = document.getElementById("categoryRow");
const tabButtons = document.querySelectorAll(".tab");
const cardTemplate = document.getElementById("cardTemplate");
const searchInput = document.getElementById("searchInput");
const sortSelect = document.getElementById("sortSelect");

// Tabs that need to know "who is this student" (require Telegram login)
const AUTH_REQUIRED_TABS = new Set(["favorites", "mine"]);

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

function buildQuery(extra = {}) {
  const params = new URLSearchParams();
  if (currentCategoryId) params.set("category_id", currentCategoryId);
  if (currentSearch) params.set("search", currentSearch);
  if (currentSort) params.set("sort", currentSort);
  Object.entries(extra).forEach(([k, v]) => { if (v) params.set(k, v); });
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

async function loadListings() {
  // "Not logged in yet" guard for tabs that need Telegram auth
  if (AUTH_REQUIRED_TABS.has(currentTab) && !(tg && tg.initData)) {
    grid.innerHTML = `<p class="empty">Open this from the Marageli bot in Telegram to see this page.</p>`;
    return;
  }

  grid.innerHTML = `<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>`;

  try {
    let items;
    if (currentTab === "store") {
      items = await fetchJSON(`/api/store${buildQuery()}`);
    } else if (currentTab === "market") {
      items = await fetchJSON(`/api/listings${buildQuery()}`);
    } else if (currentTab === "favorites") {
      items = await fetchJSON("/api/favorites");
    } else {
      items = await fetchJSON("/api/my-listings");
    }
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

    // Status badge (only meaningful on "My Listings", where items aren't all approved)
    if (currentTab === "mine" && item.status !== "approved") {
      const badge = node.querySelector(".status-badge");
      badge.textContent = item.status.replace("_", " ");
      badge.classList.add("show", item.status);
    }

    // Favorite heart
    const favBtn = node.querySelector(".fav-btn");
    setFavButtonState(favBtn, item.is_favorite);
    favBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!(tg && tg.initData)) return;
      try {
        if (favBtn.classList.contains("active")) {
          await fetchJSON(`/api/favorites/${item.id}`, { method: "DELETE" });
          setFavButtonState(favBtn, false);
          if (currentTab === "favorites") card.remove();
        } else {
          await fetchJSON(`/api/favorites/${item.id}`, { method: "POST" });
          setFavButtonState(favBtn, true);
        }
      } catch (err) { /* ignore — keep UI unchanged on failure */ }
    });

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

function setFavButtonState(btn, isFavorite) {
  btn.textContent = isFavorite ? "♥" : "♡";
  btn.classList.toggle("active", !!isFavorite);
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

// ---- Tabs ----
tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    tabButtons.forEach((b) => b.classList.remove("active"));
    button.classList.add("active");
    currentTab = button.dataset.tab;
    currentCategoryId = null;
    document.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
    if (categoryRow.firstChild) categoryRow.firstChild.classList.add("active");

    const showCategoriesAndToolbar = currentTab === "store" || currentTab === "market";
    categoryRow.style.display = currentTab === "market" ? "flex" : "none";
    document.querySelector(".toolbar").style.display = showCategoriesAndToolbar ? "flex" : "none";

    loadListings();
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
