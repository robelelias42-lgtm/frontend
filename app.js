// Marageli (ማራጌሊ) — frontend logic
// This file only ever talks to YOUR backend API. It never touches the
// database directly — that's on purpose, see the security note in README.

// Tell Telegram the Mini App is ready and let it size itself correctly.
if (window.Telegram && window.Telegram.WebApp) {
  window.Telegram.WebApp.ready();
  window.Telegram.WebApp.expand();
}

// ---- Put your real deployed backend URL here once Render is live ----
const API_BASE_URL = "https://backend-pro-4t3h.onrender.com"; // e.g. "https://marageli-api.onrender.com"

let currentTab = "store";       // "store" or "market"
let currentCategoryId = null;   // null = all categories
let categories = [];

const grid = document.getElementById("grid");
const categoryRow = document.getElementById("categoryRow");
const tabButtons = document.querySelectorAll(".tab");
const cardTemplate = document.getElementById("cardTemplate");

async function fetchJSON(path) {
  const response = await fetch(`${API_BASE_URL}${path}`);
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

async function loadListings() {
  grid.innerHTML = `<p class="loading">Loading…</p>`;

  try {
    let items;
    if (currentTab === "store") {
      items = await fetchJSON("/api/store");
    } else {
      const query = currentCategoryId ? `?category_id=${currentCategoryId}` : "";
      items = await fetchJSON(`/api/listings${query}`);
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
    node.querySelector("img").src = `${API_BASE_URL}${item.photo_url}`;
    node.querySelector(".card-title").textContent = item.title;
    node.querySelector(".card-price").textContent = `${item.price_etb} ${item.currency}`;
    node.querySelector(".card-pickup").textContent = item.pickup_location || "";
    grid.appendChild(node);
  });
}

tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    tabButtons.forEach((b) => b.classList.remove("active"));
    button.classList.add("active");
    currentTab = button.dataset.tab;
    currentCategoryId = null;

    categoryRow.style.display = currentTab === "market" ? "flex" : "none";
    loadListings();
  });
});

// First load
categoryRow.style.display = "none"; // hidden on Store tab by default
loadCategories();
loadListings();
