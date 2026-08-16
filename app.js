import { DOCUMENTS, PROFILE } from "./src/content.generated.js";

const docBySlug = new Map(DOCUMENTS.map((doc) => [doc.slug, doc]));

const dom = {
  title: document.querySelector("#article-title"),
  date: document.querySelector("#article-date"),
  body: document.querySelector("#article-body"),
  social: document.querySelector("#social-links"),
  searchButton: document.querySelector(".search-button"),
  searchContainer: document.querySelector(".search-container"),
  searchInput: document.querySelector(".search-bar"),
  searchLayout: document.querySelector(".search-layout"),
  results: document.querySelector(".results-container"),
  preview: document.querySelector(".preview-inner"),
  darkmode: document.querySelector(".darkmode"),
  sidebarToggle: document.querySelector(".sidebar-toggle"),
};

function routeFromHash() {
  return window.location.hash.replace(/^#\/?/, "") || "index";
}

function formatTitle(doc) {
  if (doc.slug === "index" || doc.title === PROFILE.siteTitle) return PROFILE.siteTitle;
  return `${doc.title} - ${PROFILE.siteTitle}`;
}

function renderPage(slug = routeFromHash()) {
  const doc = docBySlug.get(slug) || docBySlug.get("index");

  document.body.dataset.slug = doc.slug;
  document.title = formatTitle(doc);
  dom.title.textContent = doc.title;
  const dateContainer = dom.date.closest(".content-meta");
  if (doc.date) {
    dateContainer.hidden = false;
    dom.date.dateTime = toDateTime(doc.date);
    dom.date.textContent = doc.date;
  } else {
    dateContainer.hidden = true;
    dom.date.removeAttribute("datetime");
    dom.date.textContent = "";
  }
  dom.body.innerHTML = doc.html;

  document.querySelectorAll("[data-route]").forEach((link) => {
    link.addEventListener("click", (event) => {
      const target = event.currentTarget.getAttribute("data-route");
      if (!target) return;
      event.preventDefault();
      navigateTo(target);
    });
  });
}

function toDateTime(dateLabel) {
  const parsed = new Date(dateLabel);
  return Number.isNaN(parsed.valueOf()) ? "" : parsed.toISOString();
}

function navigateTo(slug) {
  window.location.hash = `/${slug === "index" ? "" : slug}`;
  renderPage(slug);
  window.scrollTo({ top: 0, behavior: "instant" });
}

function renderSocialLinks() {
  const links = [
    ["Email", `mailto:${PROFILE.email}`],
    ["GitHub", PROFILE.github],
    ["Google Scholar", PROFILE.scholar],
  ];

  dom.social.innerHTML = links
    .map(([label, href]) => `<li><a href="${escapeAttribute(href)}" rel="me noopener">${label}</a></li>`)
    .join("");
}

function setTheme(theme) {
  document.documentElement.setAttribute("saved-theme", theme);
  localStorage.setItem("theme", theme);
}

function initTheme() {
  const stored = localStorage.getItem("theme");
  const preferred = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  setTheme(stored || preferred);
}

function openSearch() {
  dom.searchContainer.classList.add("active");
  dom.searchContainer.setAttribute("aria-hidden", "false");
  document.body.classList.add("search-open");
  dom.searchInput.value = "";
  renderResults("");
  requestAnimationFrame(() => dom.searchInput.focus());
}

function closeSearch() {
  dom.searchContainer.classList.remove("active");
  dom.searchContainer.setAttribute("aria-hidden", "true");
  document.body.classList.remove("search-open");
}

function normalize(value) {
  return value.toLowerCase().trim();
}

function searchDocuments(query) {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  return DOCUMENTS.map((doc) => {
    const title = normalize(doc.title);
    const body = normalize(doc.content);
    const tags = normalize(doc.tags.join(" "));
    const haystack = `${title} ${body} ${tags}`;
    if (!terms.every((term) => haystack.includes(term))) return null;

    const score = terms.reduce((total, term) => {
      const titleHit = title.includes(term) ? 6 : 0;
      const tagHit = tags.includes(term) ? 3 : 0;
      const bodyHit = body.includes(term) ? 1 : 0;
      return total + titleHit + tagHit + bodyHit;
    }, 0);

    return { doc, score, excerpt: makeExcerpt(doc.content, terms) };
  })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.doc.title.localeCompare(b.doc.title));
}

function makeExcerpt(content, terms) {
  const lower = content.toLowerCase();
  const firstHit = terms
    .map((term) => lower.indexOf(term))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];
  const start = Math.max(0, (firstHit || 0) - 70);
  const excerpt = content.slice(start, start + 180).trim();
  return `${start > 0 ? "... " : ""}${excerpt}${start + 180 < content.length ? " ..." : ""}`;
}

function renderResults(query) {
  const results = searchDocuments(query);

  if (!query.trim()) {
    dom.searchLayout.classList.remove("display-results");
    dom.results.innerHTML = "";
    dom.preview.innerHTML = "";
    return;
  }

  dom.searchLayout.classList.add("display-results");

  if (results.length === 0) {
    dom.results.innerHTML = `<p class="no-results">No results for <strong>${escapeHtml(query)}</strong></p>`;
    dom.preview.innerHTML = "";
    return;
  }

  dom.results.innerHTML = results
    .map(({ doc, excerpt }, index) => resultCard(doc, excerpt, query, index))
    .join("");

  const first = results[0];
  renderPreview(first.doc, first.excerpt, query);

  document.querySelectorAll(".result-card").forEach((button) => {
    button.addEventListener("mouseenter", () => setActiveResult(button, query));
    button.addEventListener("focus", () => setActiveResult(button, query));
    button.addEventListener("click", () => {
      const slug = button.getAttribute("data-slug");
      closeSearch();
      navigateTo(slug);
    });
  });
}

function resultCard(doc, excerpt, query, index) {
  const tags = doc.tags.length
    ? `<ul class="tags">${doc.tags.map((tag) => `<li><p>${escapeHtml(tag)}</p></li>`).join("")}</ul>`
    : "";

  return `
    <button class="result-card${index === 0 ? " focus" : ""}" type="button" data-slug="${escapeAttribute(doc.slug)}" role="option">
      <h3>${highlight(doc.title, query)}</h3>
      ${tags}
      <p class="card-description preview">${highlight(excerpt, query)}</p>
    </button>
  `;
}

function setActiveResult(button, query) {
  document.querySelectorAll(".result-card.focus").forEach((card) => card.classList.remove("focus"));
  button.classList.add("focus");
  const doc = docBySlug.get(button.getAttribute("data-slug"));
  if (!doc) return;
  renderPreview(doc, makeExcerpt(doc.content, normalize(query).split(/\s+/).filter(Boolean)), query);
}

function renderPreview(doc, excerpt, query) {
  const dateLine = doc.date
    ? `<p show-comma="true" class="content-meta"><time>${escapeHtml(doc.date)}</time></p>`
    : "";

  dom.preview.innerHTML = `
    <h1>${escapeHtml(doc.title)}</h1>
    ${dateLine}
    <p>${highlight(excerpt, query)}</p>
    <hr>
    ${doc.html}
  `;
}

function moveResultFocus(direction) {
  const cards = Array.from(document.querySelectorAll(".result-card"));
  if (cards.length === 0) return;

  const current = document.activeElement.classList.contains("result-card")
    ? cards.indexOf(document.activeElement)
    : cards.findIndex((card) => card.classList.contains("focus"));
  const next = (current + direction + cards.length) % cards.length;
  cards[next].focus();
}

function highlight(value, query) {
  const terms = normalize(query)
    .split(/\s+/)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  if (terms.length === 0) return escapeHtml(value);

  const pattern = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "gi");
  return escapeHtml(value).replace(pattern, "<mark>$1</mark>");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}

function initSearch() {
  dom.searchButton.addEventListener("click", openSearch);
  dom.searchContainer.addEventListener("click", (event) => {
    if (event.target === dom.searchContainer) closeSearch();
  });
  dom.searchInput.addEventListener("input", (event) => renderResults(event.target.value));

  document.addEventListener("keydown", (event) => {
    const key = event.key;
    const openShortcut = (event.metaKey || event.ctrlKey) && key.toLowerCase() === "k";

    if (openShortcut) {
      event.preventDefault();
      openSearch();
      return;
    }

    if (!dom.searchContainer.classList.contains("active")) return;

    if (key === "Escape") {
      event.preventDefault();
      closeSearch();
    } else if (key === "ArrowDown") {
      event.preventDefault();
      moveResultFocus(1);
    } else if (key === "ArrowUp") {
      event.preventDefault();
      moveResultFocus(-1);
    }
  });
}

function initSidebar() {
  function setSidebar(open) {
    document.body.classList.toggle("sidebar-collapsed", !open);
    document.body.classList.toggle("sidebar-open", open);
    dom.sidebarToggle.setAttribute("aria-expanded", String(open));
    dom.sidebarToggle.setAttribute("aria-label", open ? "Close sidebar" : "Open sidebar");
  }

  setSidebar(false);

  dom.sidebarToggle.addEventListener("click", () => {
    setSidebar(!document.body.classList.contains("sidebar-open"));
  });
}

function init() {
  initTheme();
  renderSocialLinks();
  renderPage();
  initSearch();
  initSidebar();

  dom.darkmode.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("saved-theme");
    setTheme(current === "dark" ? "light" : "dark");
  });

  window.addEventListener("hashchange", () => renderPage());
}

init();
