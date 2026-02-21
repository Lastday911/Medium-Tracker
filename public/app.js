const apiKeyInput = document.getElementById("apiKey");
const verifyBtn = document.getElementById("verifyBtn");
const verifyStatus = document.getElementById("verifyStatus");
const modelSelect = document.getElementById("modelSelect");
const categorySelect = document.getElementById("categorySelect");
const searchBtn = document.getElementById("searchBtn");
const results = document.getElementById("results");
const bestTopic = document.getElementById("bestTopic");
const topicList = document.getElementById("topicList");
const resultActions = document.getElementById("resultActions");
const actionStatus = document.getElementById("actionStatus");
const copyBtn = document.getElementById("copyBtn");
const telegramBtn = document.getElementById("telegramBtn");
const whatsappBtn = document.getElementById("whatsappBtn");
const exportJsonBtn = document.getElementById("exportJsonBtn");
const exportMdBtn = document.getElementById("exportMdBtn");
const refreshHistoryBtn = document.getElementById("refreshHistoryBtn");
const historyStatus = document.getElementById("historyStatus");
const historyList = document.getElementById("historyList");
const adminTokenInput = document.getElementById("adminToken");
const adminLoadBtn = document.getElementById("adminLoadBtn");
const adminStatus = document.getElementById("adminStatus");
const adminContent = document.getElementById("adminContent");
const adminCategoryMeta = document.getElementById("adminCategoryMeta");
const adminCategorySlugInput = document.getElementById("adminCategorySlug");
const adminCategoryLabelInput = document.getElementById("adminCategoryLabel");
const adminCategorySortOrderInput = document.getElementById("adminCategorySortOrder");
const adminCategoryIsActiveInput = document.getElementById("adminCategoryIsActive");
const adminCategoryInstructionInput = document.getElementById("adminCategoryInstruction");
const adminCreateCategoryBtn = document.getElementById("adminCreateCategoryBtn");
const adminCategoryList = document.getElementById("adminCategoryList");
const adminPromptMeta = document.getElementById("adminPromptMeta");
const adminPromptTemplateKeyInput = document.getElementById("adminPromptTemplateKey");
const adminPromptLocaleInput = document.getElementById("adminPromptLocale");
const adminPromptActivateInput = document.getElementById("adminPromptActivate");
const adminPromptSetDefaultInput = document.getElementById("adminPromptSetDefault");
const adminPromptTemplateTextInput = document.getElementById("adminPromptTemplateText");
const adminCreatePromptVersionBtn = document.getElementById("adminCreatePromptVersionBtn");
const adminPromptList = document.getElementById("adminPromptList");
const adminPolicyModelIdInput = document.getElementById("adminPolicyModelId");
const adminPolicyPriorityInput = document.getElementById("adminPolicyPriority");
const adminPolicySearchContextInput = document.getElementById("adminPolicySearchContext");
const adminPolicyMaxTokensInput = document.getElementById("adminPolicyMaxTokens");
const adminPolicyMaxRetryTokensInput = document.getElementById("adminPolicyMaxRetryTokens");
const adminPolicyEnabledInput = document.getElementById("adminPolicyEnabled");
const adminPolicyWebSearchInput = document.getElementById("adminPolicyWebSearch");
const adminPolicyStructuredOutputInput = document.getElementById("adminPolicyStructuredOutput");
const adminCreatePolicyBtn = document.getElementById("adminCreatePolicyBtn");
const adminPolicyList = document.getElementById("adminPolicyList");
const adminFlagKeyInput = document.getElementById("adminFlagKey");
const adminFlagRolloutInput = document.getElementById("adminFlagRollout");
const adminFlagEnabledInput = document.getElementById("adminFlagEnabled");
const adminFlagDescriptionInput = document.getElementById("adminFlagDescription");
const adminFlagConfigInput = document.getElementById("adminFlagConfig");
const adminSaveFlagBtn = document.getElementById("adminSaveFlagBtn");
const adminFlagList = document.getElementById("adminFlagList");

let lastVerifiedApiKey = "";
let latestResult = null;
let resultScrollFrameId = null;
let defaultCategorySlug = "";
let adminToken = "";
let adminCategories = [];
let adminPromptTemplates = [];
let adminPromptActiveTemplateKey = "";
let adminModelPolicies = [];
let adminFeatureFlags = [];
let adminCategoryManagementEnabled = true;
let adminDynamicConfigManagementEnabled = true;
let adminFeatureFlagManagementEnabled = true;
let adminWriteEnabledForRequest = false;
let adminDefaultCategory = "";
const categoryLabelsBySlug = new Map();

function getSelectedCategory() {
  const category = categorySelect?.value || "";
  if (category && categoryLabelsBySlug.has(category)) {
    return category;
  }
  if (defaultCategorySlug && categoryLabelsBySlug.has(defaultCategorySlug)) {
    return defaultCategorySlug;
  }
  const [firstCategory] = categoryLabelsBySlug.keys();
  return firstCategory || "";
}

function getCategoryLabel(categorySlug) {
  return categoryLabelsBySlug.get(categorySlug) || categorySlug || "Nicht angegeben";
}

function applyStatusState(element, message, isError = false) {
  const hasMessage = Boolean(message);
  element.textContent = message || "";
  element.classList.toggle("error", hasMessage && Boolean(isError));
  element.classList.toggle("success", hasMessage && !Boolean(isError));
}

function setStatus(message, isError = false) {
  applyStatusState(verifyStatus, message, isError);
}

function setActionStatus(message, isError = false) {
  applyStatusState(actionStatus, message, isError);
}

function setHistoryStatus(message, isError = false) {
  applyStatusState(historyStatus, message, isError);
}

function setAdminStatus(message, isError = false) {
  if (!adminStatus) return;
  applyStatusState(adminStatus, message, isError);
}

function setButtonLoading(button, activeText, isLoading) {
  if (isLoading) {
    button.dataset.prevText = button.textContent;
    button.textContent = activeText;
    button.disabled = true;
    return;
  }
  button.textContent = button.dataset.prevText || button.textContent;
  button.disabled = false;
}

function resetModelSelection() {
  modelSelect.disabled = true;
  modelSelect.innerHTML = '<option value="">Bitte zuerst API-Key verifizieren</option>';
  searchBtn.disabled = true;
}

function resetCategorySelection(message = "Kategorien werden geladen...") {
  if (!categorySelect) return;
  categorySelect.disabled = true;
  categorySelect.innerHTML = `<option value="">${escapeHtml(message)}</option>`;
}

function renderCategoryOptions(categories, defaultCategory) {
  categoryLabelsBySlug.clear();
  defaultCategorySlug = "";

  if (!Array.isArray(categories) || !categories.length) {
    resetCategorySelection("Keine Kategorien verfuegbar");
    return false;
  }

  categorySelect.innerHTML = "";
  for (const category of categories) {
    const slug = toText(category?.slug);
    const label = toText(category?.label);
    if (!slug || !label) {
      continue;
    }
    categoryLabelsBySlug.set(slug, label);
    const option = document.createElement("option");
    option.value = slug;
    option.textContent = label;
    categorySelect.appendChild(option);
  }

  if (!categoryLabelsBySlug.size) {
    resetCategorySelection("Keine gueltigen Kategorien verfuegbar");
    return false;
  }

  defaultCategorySlug = toText(defaultCategory);
  if (!defaultCategorySlug || !categoryLabelsBySlug.has(defaultCategorySlug)) {
    defaultCategorySlug = categorySelect.options[0]?.value || "";
  }
  categorySelect.value = defaultCategorySlug;
  categorySelect.disabled = false;
  return true;
}

function resetResultView() {
  if (resultScrollFrameId !== null) {
    window.cancelAnimationFrame(resultScrollFrameId);
    resultScrollFrameId = null;
  }
  latestResult = null;
  results.classList.add("hidden");
  resultActions.classList.add("hidden");
  bestTopic.innerHTML = "";
  topicList.innerHTML = "";
  setActionStatus("");
}

async function parseJsonSafe(response) {
  try {
    return await response.json();
  } catch (_error) {
    return {
      ok: false,
      message: `Ungültige Serverantwort (HTTP ${response.status}).`
    };
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 45000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function loadCategories() {
  resetCategorySelection("Kategorien werden geladen...");
  try {
    const response = await fetchWithTimeout("/api/categories", { method: "GET" }, 30000);
    const payload = await parseJsonSafe(response);
    if (!response.ok || !payload.ok) {
      throw new Error(payload.message || "Kategorien konnten nicht geladen werden.");
    }

    const categories = Array.isArray(payload.categories) ? payload.categories : [];
    const ok = renderCategoryOptions(categories, payload.defaultCategory);
    if (!ok) {
      throw new Error("Es stehen aktuell keine nutzbaren Kategorien zur Verfuegung.");
    }

    return true;
  } catch (error) {
    resetCategorySelection("Kategorien konnten nicht geladen werden");
    setStatus(error.message || "Kategorien konnten nicht geladen werden.", true);
    return false;
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function toText(value) {
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function toPositiveIntOrNull(value) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function toIntInRangeOrNull(value, min, max) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  if (parsed < min || parsed > max) {
    return null;
  }
  return parsed;
}

function getAdminToken() {
  const tokenFromInput = toText(adminTokenInput?.value);
  if (tokenFromInput) {
    return tokenFromInput;
  }
  return toText(adminToken);
}

function getAdminHeaders(includeJson = false) {
  const token = getAdminToken();
  if (!token) {
    throw new Error("Bitte zuerst ein Admin-Token eingeben.");
  }
  const headers = {
    "x-admin-token": token
  };
  if (includeJson) {
    headers["Content-Type"] = "application/json";
  }
  return headers;
}

async function adminRequest(path, options = {}) {
  const method = options.method || "GET";
  const body = options.body;
  const includeJson = body !== undefined;
  const response = await fetchWithTimeout(
    path,
    {
      method,
      headers: getAdminHeaders(includeJson),
      body: includeJson ? JSON.stringify(body) : undefined
    },
    40000
  );
  const payload = await parseJsonSafe(response);
  if (!response.ok || !payload.ok) {
    throw new Error(payload.message || "Admin-Anfrage fehlgeschlagen.");
  }
  return payload;
}

function normalizeResultPayload(payload) {
  const topics = normalizeArray(payload?.topics)
    .slice(0, 5)
    .map((topic) => ({
      title: toText(topic?.title),
      why_now: toText(topic?.why_now),
      complexity: toText(topic?.complexity),
      audience_potential: toText(topic?.audience_potential),
      article_angles: normalizeArray(topic?.article_angles).map(toText).filter(Boolean)
    }));

  const bestRecommendation = payload?.bestRecommendation
    ? {
        topic_title: toText(payload.bestRecommendation.topic_title),
        headline: toText(payload.bestRecommendation.headline),
        summary: toText(payload.bestRecommendation.summary),
        focus_points: normalizeArray(payload.bestRecommendation.focus_points)
          .map(toText)
          .filter(Boolean)
      }
    : null;

  return {
    model: toText(payload?.model),
    category: toText(payload?.category),
    categoryLabel: toText(payload?.categoryLabel),
    topics,
    bestRecommendation
  };
}

function renderTopics(topics) {
  topicList.innerHTML = "";
  for (const topic of topics) {
    const card = document.createElement("article");
    card.className = "topic";
    const angles = Array.isArray(topic.article_angles)
      ? topic.article_angles.map((x) => `<li>${escapeHtml(x)}</li>`).join("")
      : "";
    card.innerHTML = `
      <h3>${escapeHtml(topic.title)}</h3>
      <p><strong>Warum jetzt:</strong> ${escapeHtml(topic.why_now)}</p>
      <p><strong>Komplexität:</strong> ${escapeHtml(topic.complexity)}</p>
      <p><strong>Leserpotenzial:</strong> ${escapeHtml(topic.audience_potential)}</p>
      <p><strong>Artikelwinkel:</strong></p>
      <ul>${angles}</ul>
    `;
    topicList.appendChild(card);
  }
}

function renderRecommendation(data) {
  if (!data) {
    bestTopic.innerHTML = "<h2>Keine Empfehlung verfügbar.</h2>";
    return;
  }
  const focus = Array.isArray(data.focus_points)
    ? data.focus_points.map((x) => `<li>${escapeHtml(x)}</li>`).join("")
    : "";
  bestTopic.innerHTML = `
    <h2>Top-Empfehlung: ${escapeHtml(data.topic_title)}</h2>
    <p><strong>Vorgeschlagene Überschrift:</strong> ${escapeHtml(data.headline)}</p>
    <p>${escapeHtml(data.summary)}</p>
    <p><strong>Fokuspunkte:</strong></p>
    <ul>${focus}</ul>
  `;
}

function focusResults() {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const offsetTop = 64;
  const targetTop = Math.max(window.scrollY + bestTopic.getBoundingClientRect().top - offsetTop, 0);

  if (resultScrollFrameId !== null) {
    window.cancelAnimationFrame(resultScrollFrameId);
    resultScrollFrameId = null;
  }

  if (prefersReducedMotion) {
    window.scrollTo({ top: targetTop, behavior: "auto" });
    return;
  }

  const startTop = window.scrollY;
  const distance = targetTop - startTop;
  const durationMs = 950;
  const startTime = performance.now();
  const easeInOutCubic = (t) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  const step = (timestamp) => {
    const elapsed = timestamp - startTime;
    const progress = Math.min(elapsed / durationMs, 1);
    const eased = easeInOutCubic(progress);
    window.scrollTo(0, startTop + distance * eased);
    if (progress < 1) {
      resultScrollFrameId = window.requestAnimationFrame(step);
      return;
    }
    resultScrollFrameId = null;
  };

  resultScrollFrameId = window.requestAnimationFrame(step);
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unbekannt";
  }
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

function buildHistoryMeta(entry) {
  const parts = [];
  parts.push(formatDateTime(entry.createdAt));
  if (entry.model) {
    parts.push(`Modell: ${entry.model}`);
  }
  if (entry.categoryLabel || entry.category) {
    parts.push(`Kategorie: ${entry.categoryLabel || entry.category}`);
  }
  if (Number.isFinite(entry.latencyMs)) {
    parts.push(`Dauer: ${entry.latencyMs} ms`);
  }
  return parts.join(" | ");
}

function renderHistory(items) {
  historyList.innerHTML = "";

  if (!Array.isArray(items) || !items.length) {
    historyList.innerHTML =
      '<p class="history-empty">Noch keine Suchlaeufe vorhanden.</p>';
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const entry of items) {
    const row = document.createElement("article");
    row.className = "history-item";

    const topTitle =
      toText(entry.bestTopicTitle) ||
      (entry.status === "error" ? "Fehlgeschlagene Suche" : "Ergebnis ohne Top-Thema");
    const summary = buildHistoryMeta(entry);
    const topicCountText =
      Number.isFinite(entry.topicCount) && entry.topicCount > 0
        ? `${entry.topicCount} Themen`
        : "Keine Themen";

    row.innerHTML = `
      <div class="history-main">
        <h3>${escapeHtml(topTitle)}</h3>
        <p class="history-meta">${escapeHtml(summary)}</p>
        <p class="history-meta">${
          entry.status === "error"
            ? `Status: Fehler${entry.errorMessage ? ` - ${escapeHtml(entry.errorMessage)}` : ""}`
            : `Status: Erfolgreich - ${escapeHtml(topicCountText)}`
        }</p>
      </div>
      <div class="history-actions" role="group" aria-label="Verlaufsaktionen">
        <button
          type="button"
          class="secondary-btn history-load-btn"
          data-action="load"
          data-id="${entry.id}"
          ${entry.status === "success" ? "" : "disabled"}
        >
          Laden
        </button>
        <button
          type="button"
          class="secondary-btn history-delete-btn"
          data-action="delete"
          data-id="${entry.id}"
        >
          Loeschen
        </button>
      </div>
    `;

    fragment.appendChild(row);
  }

  historyList.appendChild(fragment);
}

function ensureResultAvailable() {
  if (!latestResult || !latestResult.topics.length) {
    setActionStatus("Kein Ergebnis vorhanden. Bitte zuerst eine Themensuche ausführen.", true);
    return false;
  }
  return true;
}

function buildReadableText(result) {
  const lines = [];
  lines.push("Medium Tracker - Ergebnis");
  lines.push(`Modell: ${result.model}`);
  lines.push(`Kategorie: ${result.categoryLabel || result.category || "Nicht angegeben"}`);
  lines.push("");

  if (result.bestRecommendation) {
    lines.push(`Top-Empfehlung: ${result.bestRecommendation.topic_title}`);
    lines.push(`Überschrift: ${result.bestRecommendation.headline}`);
    lines.push(`${result.bestRecommendation.summary}`);
    lines.push("Fokuspunkte:");
    for (const point of normalizeArray(result.bestRecommendation.focus_points)) {
      lines.push(`- ${point}`);
    }
    lines.push("");
  }

  lines.push("Weitere Themen:");
  result.topics.forEach((topic, index) => {
    lines.push(`${index + 1}. ${topic.title}`);
    lines.push(`   Warum jetzt: ${topic.why_now}`);
    lines.push(`   Komplexität: ${topic.complexity}`);
    lines.push(`   Leserpotenzial: ${topic.audience_potential}`);
    const angles = normalizeArray(topic.article_angles);
    if (angles.length) {
      lines.push("   Artikelwinkel:");
      for (const angle of angles) {
        lines.push(`   - ${angle}`);
      }
    }
    lines.push("");
  });

  return lines.join("\n").trim();
}

function buildMarkdown(result) {
  const lines = [];
  lines.push("# Medium Tracker Ergebnis");
  lines.push("");
  lines.push(`- Modell: \`${result.model}\``);
  lines.push(`- Kategorie: ${result.categoryLabel || result.category || "Nicht angegeben"}`);
  lines.push("");

  if (result.bestRecommendation) {
    lines.push("## Top-Empfehlung");
    lines.push("");
    lines.push(`**Thema:** ${result.bestRecommendation.topic_title}`);
    lines.push("");
    lines.push(`**Überschrift:** ${result.bestRecommendation.headline}`);
    lines.push("");
    lines.push(result.bestRecommendation.summary);
    lines.push("");
    lines.push("**Fokuspunkte**");
    for (const point of normalizeArray(result.bestRecommendation.focus_points)) {
      lines.push(`- ${point}`);
    }
    lines.push("");
  }

  lines.push("## Weitere Themen");
  lines.push("");
  result.topics.forEach((topic, index) => {
    lines.push(`### ${index + 1}. ${topic.title}`);
    lines.push("");
    lines.push(`- Warum jetzt: ${topic.why_now}`);
    lines.push(`- Komplexität: ${topic.complexity}`);
    lines.push(`- Leserpotenzial: ${topic.audience_potential}`);
    const angles = normalizeArray(topic.article_angles);
    if (angles.length) {
      lines.push("- Artikelwinkel:");
      for (const angle of angles) {
        lines.push(`  - ${angle}`);
      }
    }
    lines.push("");
  });
  return lines.join("\n").trim();
}

function buildExportPayload(result) {
  return {
    app: "Medium Tracker",
    exportedAt: new Date().toISOString(),
    model: result.model,
    category: result.category || "",
    categoryLabel: result.categoryLabel || "",
    bestRecommendation: result.bestRecommendation,
    topics: result.topics
  };
}

function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

function truncateText(text, maxLength = 3000) {
  const value = String(text || "");
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}

async function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "readonly");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) {
    throw new Error("Kopieren in die Zwischenablage war nicht möglich.");
  }
}

function openShareWindow(url) {
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) {
    throw new Error("Popup wurde blockiert. Bitte Popups für diese Seite erlauben.");
  }
}

function getTelegramShareUrl(text) {
  let shareUrl = "https://medium.com";
  try {
    const current = new URL(window.location.href);
    const isWeb = current.protocol === "http:" || current.protocol === "https:";
    const isLocalHost =
      current.hostname === "localhost" ||
      current.hostname === "127.0.0.1" ||
      current.hostname === "::1";
    if (isWeb && !isLocalHost) {
      shareUrl = current.href;
    }
  } catch (_error) {
    // Fallback URL bleibt bestehen.
  }

  // Telegram share links support a message + URL. Keep text concise to avoid 400 on long query strings.
  const compactText = truncateText(text, 1100);
  return `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(compactText)}`;
}

async function handleCopy() {
  if (!ensureResultAvailable()) return;
  try {
    await copyToClipboard(buildReadableText(latestResult));
    setActionStatus("Text wurde in die Zwischenablage kopiert.");
  } catch (error) {
    setActionStatus(error.message || "Kopieren fehlgeschlagen.", true);
  }
}

function handleSendTelegram() {
  if (!ensureResultAvailable()) return;
  try {
    const text = buildReadableText(latestResult);
    const url = getTelegramShareUrl(text);
    openShareWindow(url);
    setActionStatus("Telegram-Fenster wurde geöffnet.");
  } catch (error) {
    setActionStatus(error.message || "Telegram konnte nicht geöffnet werden.", true);
  }
}

function handleSendWhatsApp() {
  if (!ensureResultAvailable()) return;
  try {
    const text = truncateText(`${buildReadableText(latestResult)}\n\n${window.location.href}`, 2200);
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    openShareWindow(url);
    setActionStatus("WhatsApp-Fenster wurde geöffnet.");
  } catch (error) {
    setActionStatus(error.message || "WhatsApp konnte nicht geöffnet werden.", true);
  }
}

function handleExportJson() {
  if (!ensureResultAvailable()) return;
  const json = JSON.stringify(buildExportPayload(latestResult), null, 2);
  downloadFile("medium-tracker-ergebnis.json", json, "application/json;charset=utf-8");
  setActionStatus("JSON-Datei wurde gespeichert.");
}

function handleExportMarkdown() {
  if (!ensureResultAvailable()) return;
  const markdown = buildMarkdown(latestResult);
  downloadFile("medium-tracker-ergebnis.md", markdown, "text/markdown;charset=utf-8");
  setActionStatus("Markdown-Datei wurde gespeichert.");
}

async function refreshHistory(options = {}) {
  const silent = Boolean(options.silent);
  if (!silent) {
    setHistoryStatus("Verlauf wird geladen...");
  }

  try {
    const response = await fetchWithTimeout("/api/history?limit=30", { method: "GET" }, 30000);
    const payload = await parseJsonSafe(response);
    if (!response.ok || !payload.ok) {
      throw new Error(payload.message || "Verlauf konnte nicht geladen werden.");
    }

    const items = Array.isArray(payload.items) ? payload.items : [];
    renderHistory(items);
    if (!silent) {
      setHistoryStatus(`${items.length} Eintraege im Verlauf geladen.`);
    } else {
      setHistoryStatus("");
    }
  } catch (error) {
    renderHistory([]);
    setHistoryStatus(error.message || "Verlauf konnte nicht geladen werden.", true);
  }
}

async function loadHistoryEntry(entryId) {
  if (!entryId) return;
  setHistoryStatus("Verlaufseintrag wird geladen...");

  try {
    const response = await fetchWithTimeout(`/api/history/${encodeURIComponent(entryId)}`, { method: "GET" }, 30000);
    const payload = await parseJsonSafe(response);
    if (!response.ok || !payload.ok) {
      throw new Error(payload.message || "Verlaufseintrag konnte nicht geladen werden.");
    }

    const item = payload.item || {};
    if (item.status !== "success") {
      throw new Error("Nur erfolgreiche Suchlaeufe koennen geladen werden.");
    }
    if (!item.resultPayload || typeof item.resultPayload !== "object") {
      throw new Error("Der Verlaufseintrag enthaelt kein Ergebnis.");
    }

    latestResult = normalizeResultPayload(item.resultPayload);
    if (!latestResult.topics.length) {
      throw new Error("Der Verlaufseintrag enthaelt keine nutzbaren Themen.");
    }

    if (latestResult.category && categoryLabelsBySlug.has(latestResult.category)) {
      categorySelect.value = latestResult.category;
    }

    renderRecommendation(latestResult.bestRecommendation);
    renderTopics(latestResult.topics);
    resultActions.classList.remove("hidden");
    results.classList.remove("hidden");
    focusResults();
    setStatus(
      `Verlaufseintrag geladen: Modell ${latestResult.model || "Unbekannt"} in Kategorie "${latestResult.categoryLabel || latestResult.category || "Nicht angegeben"}".`
    );
    setHistoryStatus("Verlaufseintrag wurde geladen.");
  } catch (error) {
    setHistoryStatus(error.message || "Verlaufseintrag konnte nicht geladen werden.", true);
  }
}

async function deleteHistoryEntry(entryId) {
  if (!entryId) return;
  setHistoryStatus("Verlaufseintrag wird geloescht...");

  try {
    const response = await fetchWithTimeout(`/api/history/${encodeURIComponent(entryId)}`, { method: "DELETE" }, 30000);
    const payload = await parseJsonSafe(response);
    if (!response.ok || !payload.ok) {
      throw new Error(payload.message || "Verlaufseintrag konnte nicht geloescht werden.");
    }

    setHistoryStatus("Verlaufseintrag wurde geloescht.");
    await refreshHistory({ silent: true });
  } catch (error) {
    setHistoryStatus(error.message || "Verlaufseintrag konnte nicht geloescht werden.", true);
  }
}

function formatAdminTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "unbekannt";
  }
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

function serializeConfigJson(value) {
  try {
    return JSON.stringify(value && typeof value === "object" ? value : {}, null, 2);
  } catch (_error) {
    return "{}";
  }
}

function parseConfigJsonInput(text) {
  const value = toText(text);
  if (!value) {
    return {};
  }
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch (_error) {
    throw new Error("Config JSON ist ungueltig.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Config JSON muss ein Objekt sein.");
  }
  return parsed;
}

function buildPolicySearchContextOptions(selected) {
  const current = toText(selected) || "low";
  return ["low", "medium", "high"]
    .map((option) => (
      `<option value="${option}" ${option === current ? "selected" : ""}>${option}</option>`
    ))
    .join("");
}

function renderAdminCategories() {
  if (!adminCategoryList) return;

  if (adminCategoryMeta) {
    const defaultText = adminDefaultCategory || "nicht gesetzt";
    const modeText = adminCategoryManagementEnabled
      ? "Schreibzugriff aktiv."
      : "Schreibzugriff per Feature-Flag deaktiviert.";
    adminCategoryMeta.textContent = `Standard-Kategorie: ${defaultText} | ${modeText}`;
  }

  if (!adminCategories.length) {
    adminCategoryList.innerHTML =
      '<p class="history-empty">Keine Kategorien gefunden.</p>';
    return;
  }

  const canMutate = adminCategoryManagementEnabled;
  const fragment = document.createDocumentFragment();

  for (const category of adminCategories) {
    const slug = toText(category.slug);
    if (!slug) continue;
    const row = document.createElement("article");
    row.className = "admin-item";
    row.dataset.slug = slug;

    const statusBadge = category.isActive
      ? '<span class="admin-badge">Aktiv</span>'
      : '<span class="admin-badge">Inaktiv</span>';

    row.innerHTML = `
      <div class="admin-item-header">
        <span class="admin-item-title">${escapeHtml(slug)}</span>
        ${statusBadge}
      </div>
      <div class="admin-create-grid">
        <input data-field="label" type="text" value="${escapeHtml(toText(category.label))}" ${canMutate ? "" : "disabled"} />
        <input data-field="sortOrder" type="number" value="${Number.isFinite(category.sortOrder) ? category.sortOrder : 100}" ${canMutate ? "" : "disabled"} />
        <label class="admin-check">
          <input data-field="isActive" type="checkbox" ${category.isActive ? "checked" : ""} ${canMutate ? "" : "disabled"} />
          Aktiv
        </label>
      </div>
      <textarea data-field="instruction" rows="4" ${canMutate ? "" : "disabled"}>${escapeHtml(toText(category.instruction))}</textarea>
      <div class="admin-item-actions">
        <button type="button" class="secondary-btn" data-admin-action="save-category" data-slug="${escapeHtml(slug)}" ${canMutate ? "" : "disabled"}>
          Speichern
        </button>
        <button
          type="button"
          class="secondary-btn"
          data-admin-action="deactivate-category"
          data-slug="${escapeHtml(slug)}"
          ${canMutate && category.isActive ? "" : "disabled"}
        >
          Deaktivieren
        </button>
      </div>
    `;
    fragment.appendChild(row);
  }

  adminCategoryList.innerHTML = "";
  adminCategoryList.appendChild(fragment);
}

function renderAdminPromptTemplates() {
  if (!adminPromptList) return;

  if (adminPromptMeta) {
    const activeKey = adminPromptActiveTemplateKey || "nicht gesetzt";
    const modeText = adminDynamicConfigManagementEnabled
      ? "Schreibzugriff aktiv."
      : "Schreibzugriff per Feature-Flag deaktiviert.";
    adminPromptMeta.textContent = `Aktiver Template-Key: ${activeKey} | ${modeText}`;
  }

  if (!adminPromptTemplates.length) {
    adminPromptList.innerHTML =
      '<p class="history-empty">Keine Prompt-Templates gefunden.</p>';
    return;
  }

  const canMutate = adminDynamicConfigManagementEnabled;
  const fragment = document.createDocumentFragment();
  const sortedItems = [...adminPromptTemplates].sort((a, b) => {
    const byKey = String(a.templateKey || "").localeCompare(String(b.templateKey || ""));
    if (byKey !== 0) return byKey;
    return (Number(b.version) || 0) - (Number(a.version) || 0);
  });

  for (const item of sortedItems) {
    const templateKey = toText(item.templateKey);
    const version = Number.parseInt(String(item.version || ""), 10);
    if (!templateKey || !Number.isFinite(version)) continue;

    const preview = truncateText(toText(item.templateText), 260);
    const row = document.createElement("article");
    row.className = "admin-item";
    row.innerHTML = `
      <div class="admin-item-header">
        <span class="admin-item-title">${escapeHtml(templateKey)} v${version}</span>
        ${item.isActive ? '<span class="admin-badge">Aktiv</span>' : ""}
      </div>
      <p class="admin-note">Locale: ${escapeHtml(toText(item.locale) || "de")} | erstellt: ${escapeHtml(formatAdminTimestamp(item.createdAt))}</p>
      <p class="admin-note">${escapeHtml(preview || "(Leer)")}</p>
      <div class="admin-item-actions">
        <button
          type="button"
          class="secondary-btn"
          data-admin-action="activate-prompt"
          data-template-key="${escapeHtml(templateKey)}"
          data-version="${version}"
          ${canMutate && !item.isActive ? "" : "disabled"}
        >
          Aktivieren
        </button>
      </div>
    `;
    fragment.appendChild(row);
  }

  adminPromptList.innerHTML = "";
  adminPromptList.appendChild(fragment);
}

function renderAdminModelPolicies() {
  if (!adminPolicyList) return;

  if (!adminModelPolicies.length) {
    adminPolicyList.innerHTML =
      '<p class="history-empty">Keine Modell-Policies gefunden.</p>';
    return;
  }

  const canMutate = adminDynamicConfigManagementEnabled;
  const fragment = document.createDocumentFragment();
  const sortedItems = [...adminModelPolicies].sort((a, b) => {
    const byPriority = (Number(a.priority) || 0) - (Number(b.priority) || 0);
    if (byPriority !== 0) return byPriority;
    return String(a.modelId || "").localeCompare(String(b.modelId || ""));
  });

  for (const policy of sortedItems) {
    const modelId = toText(policy.modelId);
    if (!modelId) continue;
    const row = document.createElement("article");
    row.className = "admin-item";
    row.dataset.modelId = modelId;

    row.innerHTML = `
      <div class="admin-item-header">
        <span class="admin-item-title">${escapeHtml(modelId)}</span>
        ${policy.enabled ? '<span class="admin-badge">Enabled</span>' : '<span class="admin-badge">Disabled</span>'}
      </div>
      <div class="admin-create-grid">
        <input data-field="priority" type="number" value="${Number.isFinite(policy.priority) ? policy.priority : 100}" ${canMutate ? "" : "disabled"} />
        <select data-field="searchContextSize" ${canMutate ? "" : "disabled"}>
          ${buildPolicySearchContextOptions(policy.searchContextSize)}
        </select>
        <input data-field="maxOutputTokens" type="number" value="${Number.isFinite(policy.maxOutputTokens) ? policy.maxOutputTokens : 1800}" ${canMutate ? "" : "disabled"} />
        <input data-field="maxRetryOutputTokens" type="number" value="${Number.isFinite(policy.maxRetryOutputTokens) ? policy.maxRetryOutputTokens : 2600}" ${canMutate ? "" : "disabled"} />
        <label class="admin-check">
          <input data-field="enabled" type="checkbox" ${policy.enabled ? "checked" : ""} ${canMutate ? "" : "disabled"} />
          Enabled
        </label>
        <label class="admin-check">
          <input data-field="supportsWebSearch" type="checkbox" ${policy.supportsWebSearch ? "checked" : ""} ${canMutate ? "" : "disabled"} />
          Websuche
        </label>
        <label class="admin-check">
          <input data-field="enableStructuredOutput" type="checkbox" ${policy.enableStructuredOutput ? "checked" : ""} ${canMutate ? "" : "disabled"} />
          Structured Output
        </label>
      </div>
      <div class="admin-item-actions">
        <button type="button" class="secondary-btn" data-admin-action="save-policy" data-model-id="${escapeHtml(modelId)}" ${canMutate ? "" : "disabled"}>
          Speichern
        </button>
        <button type="button" class="secondary-btn" data-admin-action="delete-policy" data-model-id="${escapeHtml(modelId)}" ${canMutate ? "" : "disabled"}>
          Loeschen
        </button>
      </div>
    `;
    fragment.appendChild(row);
  }

  adminPolicyList.innerHTML = "";
  adminPolicyList.appendChild(fragment);
}

function renderAdminFeatureFlags() {
  if (!adminFlagList) return;

  if (!adminFeatureFlags.length) {
    adminFlagList.innerHTML =
      '<p class="history-empty">Keine Feature-Flags gefunden.</p>';
    return;
  }

  const fragment = document.createDocumentFragment();
  const canMutate = adminFeatureFlagManagementEnabled;
  const sortedItems = [...adminFeatureFlags].sort((a, b) =>
    String(a.flagKey || "").localeCompare(String(b.flagKey || ""))
  );

  for (const flag of sortedItems) {
    const flagKey = toText(flag.flagKey);
    if (!flagKey) continue;
    const row = document.createElement("article");
    row.className = "admin-item";
    row.dataset.flagKey = flagKey;
    row.innerHTML = `
      <div class="admin-item-header">
        <span class="admin-item-title">${escapeHtml(flagKey)}</span>
        ${flag.enabled ? '<span class="admin-badge">Enabled</span>' : '<span class="admin-badge">Disabled</span>'}
      </div>
      <div class="admin-create-grid">
        <input data-field="rolloutPercent" type="number" min="0" max="100" value="${Number.isFinite(flag.rolloutPercent) ? flag.rolloutPercent : 0}" ${canMutate ? "" : "disabled"} />
        <label class="admin-check">
          <input data-field="enabled" type="checkbox" ${flag.enabled ? "checked" : ""} ${canMutate ? "" : "disabled"} />
          Enabled
        </label>
        <input data-field="description" type="text" value="${escapeHtml(toText(flag.description))}" placeholder="Beschreibung" ${canMutate ? "" : "disabled"} />
      </div>
      <textarea data-field="config" rows="3" ${canMutate ? "" : "disabled"}>${escapeHtml(serializeConfigJson(flag.config))}</textarea>
      <div class="admin-item-actions">
        <button type="button" class="secondary-btn" data-admin-action="save-flag" data-flag-key="${escapeHtml(flagKey)}" ${canMutate ? "" : "disabled"}>
          Speichern
        </button>
      </div>
    `;
    fragment.appendChild(row);
  }

  adminFlagList.innerHTML = "";
  adminFlagList.appendChild(fragment);
}

function renderAdminAll() {
  renderAdminCategories();
  renderAdminPromptTemplates();
  renderAdminModelPolicies();
  renderAdminFeatureFlags();
}

function setAdminControlDisabled(control, disabled) {
  if (
    control instanceof HTMLInputElement ||
    control instanceof HTMLTextAreaElement ||
    control instanceof HTMLSelectElement ||
    control instanceof HTMLButtonElement
  ) {
    control.disabled = disabled;
  }
}

function applyAdminCreateFormState() {
  const categoryControls = [
    adminCategorySlugInput,
    adminCategoryLabelInput,
    adminCategorySortOrderInput,
    adminCategoryIsActiveInput,
    adminCategoryInstructionInput,
    adminCreateCategoryBtn
  ];
  for (const control of categoryControls) {
    setAdminControlDisabled(control, !adminCategoryManagementEnabled);
  }

  const dynamicControls = [
    adminPromptTemplateKeyInput,
    adminPromptLocaleInput,
    adminPromptActivateInput,
    adminPromptSetDefaultInput,
    adminPromptTemplateTextInput,
    adminCreatePromptVersionBtn,
    adminPolicyModelIdInput,
    adminPolicyPriorityInput,
    adminPolicySearchContextInput,
    adminPolicyMaxTokensInput,
    adminPolicyMaxRetryTokensInput,
    adminPolicyEnabledInput,
    adminPolicyWebSearchInput,
    adminPolicyStructuredOutputInput,
    adminCreatePolicyBtn
  ];
  for (const control of dynamicControls) {
    setAdminControlDisabled(control, !adminDynamicConfigManagementEnabled);
  }

  const featureFlagControls = [
    adminFlagKeyInput,
    adminFlagRolloutInput,
    adminFlagEnabledInput,
    adminFlagDescriptionInput,
    adminFlagConfigInput,
    adminSaveFlagBtn
  ];
  for (const control of featureFlagControls) {
    setAdminControlDisabled(control, !adminFeatureFlagManagementEnabled);
  }
}

async function loadAdminData(options = {}) {
  if (!adminLoadBtn) return false;

  const silent = Boolean(options.silent);
  const token = getAdminToken();
  if (!token) {
    setAdminStatus("Bitte ein Admin-Token eingeben.", true);
    return false;
  }

  adminToken = token;
  setButtonLoading(adminLoadBtn, "Lade...", true);
  if (!silent) {
    setAdminStatus("Admin-Daten werden geladen...");
  }

  try {
    const [flagsPayload, categoriesPayload, promptsPayload, policiesPayload] = await Promise.all([
      adminRequest("/api/admin/feature-flags"),
      adminRequest("/api/admin/categories"),
      adminRequest("/api/admin/prompt-templates"),
      adminRequest("/api/admin/model-policies")
    ]);

    adminFeatureFlags = normalizeArray(flagsPayload.flags);
    adminCategories = normalizeArray(categoriesPayload.categories);
    adminPromptTemplates = normalizeArray(promptsPayload.items);
    adminModelPolicies = normalizeArray(policiesPayload.items);
    adminPromptActiveTemplateKey = toText(promptsPayload.activeTemplateKey);
    adminDefaultCategory = toText(categoriesPayload.defaultCategory);
    adminWriteEnabledForRequest = flagsPayload.adminWriteEnabledForRequest === true;

    adminCategoryManagementEnabled =
      adminWriteEnabledForRequest &&
      categoriesPayload.managementEnabled !== false &&
      flagsPayload.categoryAdminEnabledForRequest !== false;
    adminDynamicConfigManagementEnabled =
      adminWriteEnabledForRequest &&
      promptsPayload.managementEnabled !== false &&
      policiesPayload.managementEnabled !== false &&
      flagsPayload.dynamicConfigEnabledForRequest !== false;
    adminFeatureFlagManagementEnabled = adminWriteEnabledForRequest;

    applyAdminCreateFormState();
    renderAdminAll();
    if (adminContent) {
      adminContent.classList.remove("hidden");
    }

    if (!silent) {
      const readonlyHint =
        !adminWriteEnabledForRequest ||
        !adminCategoryManagementEnabled ||
        !adminDynamicConfigManagementEnabled ||
        !adminFeatureFlagManagementEnabled
          ? " Einige Bereiche sind aktuell per Feature-Flag nur lesbar."
          : "";
      setAdminStatus(`Admin-Daten geladen.${readonlyHint}`);
    }

    return true;
  } catch (error) {
    if (adminContent) {
      adminContent.classList.add("hidden");
    }
    setAdminStatus(error.message || "Admin-Daten konnten nicht geladen werden.", true);
    return false;
  } finally {
    setButtonLoading(adminLoadBtn, "Lade...", false);
  }
}

async function handleAdminCreateCategory() {
  if (!adminCategoryManagementEnabled) {
    setAdminStatus("Kategorieverwaltung ist per Feature-Flag deaktiviert.", true);
    return;
  }

  const slug = toText(adminCategorySlugInput?.value);
  const label = toText(adminCategoryLabelInput?.value);
  const instruction = toText(adminCategoryInstructionInput?.value);
  const sortOrder = toPositiveIntOrNull(adminCategorySortOrderInput?.value);
  const isActive = Boolean(adminCategoryIsActiveInput?.checked);

  if (!slug || !label || !instruction) {
    setAdminStatus("Bitte Slug, Label und Instruktion fuer die Kategorie ausfuellen.", true);
    return;
  }

  try {
    await adminRequest("/api/admin/categories", {
      method: "POST",
      body: {
        slug,
        label,
        instruction,
        sortOrder: sortOrder ?? 100,
        isActive
      }
    });
    if (adminCategorySlugInput) adminCategorySlugInput.value = "";
    if (adminCategoryLabelInput) adminCategoryLabelInput.value = "";
    if (adminCategoryInstructionInput) adminCategoryInstructionInput.value = "";
    if (adminCategorySortOrderInput) adminCategorySortOrderInput.value = "";
    if (adminCategoryIsActiveInput) adminCategoryIsActiveInput.checked = true;

    setAdminStatus(`Kategorie '${slug}' erstellt.`);
    await loadAdminData({ silent: true });
    await loadCategories();
  } catch (error) {
    setAdminStatus(error.message || "Kategorie konnte nicht erstellt werden.", true);
  }
}

function findAdminRowField(row, selector) {
  const element = row.querySelector(selector);
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement
    ? element
    : null;
}

async function handleAdminSaveCategory(slug, row) {
  if (!adminCategoryManagementEnabled) {
    setAdminStatus("Kategorieverwaltung ist per Feature-Flag deaktiviert.", true);
    return;
  }
  const labelInput = findAdminRowField(row, '[data-field="label"]');
  const sortInput = findAdminRowField(row, '[data-field="sortOrder"]');
  const activeInput = findAdminRowField(row, '[data-field="isActive"]');
  const instructionInput = findAdminRowField(row, '[data-field="instruction"]');
  if (!labelInput || !sortInput || !activeInput || !instructionInput) {
    setAdminStatus("Kategoriezeile ist unvollstaendig.", true);
    return;
  }

  const sortOrder = toPositiveIntOrNull(sortInput.value);
  if (!sortOrder) {
    setAdminStatus("Sortierung muss eine positive Zahl sein.", true);
    return;
  }

  try {
    await adminRequest(`/api/admin/categories/${encodeURIComponent(slug)}`, {
      method: "PATCH",
      body: {
        label: toText(labelInput.value),
        instruction: toText(instructionInput.value),
        sortOrder,
        isActive: Boolean(activeInput.checked)
      }
    });
    setAdminStatus(`Kategorie '${slug}' gespeichert.`);
    await loadAdminData({ silent: true });
    await loadCategories();
  } catch (error) {
    setAdminStatus(error.message || "Kategorie konnte nicht gespeichert werden.", true);
  }
}

async function handleAdminDeactivateCategory(slug) {
  if (!adminCategoryManagementEnabled) {
    setAdminStatus("Kategorieverwaltung ist per Feature-Flag deaktiviert.", true);
    return;
  }
  const confirmed = window.confirm(`Kategorie '${slug}' wirklich deaktivieren?`);
  if (!confirmed) return;

  try {
    await adminRequest(`/api/admin/categories/${encodeURIComponent(slug)}`, {
      method: "DELETE"
    });
    setAdminStatus(`Kategorie '${slug}' wurde deaktiviert.`);
    await loadAdminData({ silent: true });
    await loadCategories();
  } catch (error) {
    setAdminStatus(error.message || "Kategorie konnte nicht deaktiviert werden.", true);
  }
}

async function handleAdminCreatePromptVersion() {
  if (!adminDynamicConfigManagementEnabled) {
    setAdminStatus("Prompt-Verwaltung ist per Feature-Flag deaktiviert.", true);
    return;
  }

  const templateKey = toText(adminPromptTemplateKeyInput?.value);
  const templateText = toText(adminPromptTemplateTextInput?.value);
  const locale = toText(adminPromptLocaleInput?.value) || "de";
  const activate = Boolean(adminPromptActivateInput?.checked);
  const setAsDefaultKey = Boolean(adminPromptSetDefaultInput?.checked);

  if (!templateKey || !templateText) {
    setAdminStatus("Bitte Template-Key und Template-Text ausfuellen.", true);
    return;
  }

  try {
    await adminRequest("/api/admin/prompt-templates/versions", {
      method: "POST",
      body: {
        templateKey,
        locale,
        templateText,
        activate,
        setAsDefaultKey
      }
    });
    if (adminPromptTemplateTextInput) {
      adminPromptTemplateTextInput.value = "";
    }
    setAdminStatus(`Neue Prompt-Version fuer '${templateKey}' erstellt.`);
    await loadAdminData({ silent: true });
  } catch (error) {
    setAdminStatus(error.message || "Prompt-Version konnte nicht erstellt werden.", true);
  }
}

async function handleAdminActivatePrompt(templateKey, version) {
  if (!adminDynamicConfigManagementEnabled) {
    setAdminStatus("Prompt-Verwaltung ist per Feature-Flag deaktiviert.", true);
    return;
  }

  try {
    await adminRequest("/api/admin/prompt-templates/activate", {
      method: "POST",
      body: {
        templateKey,
        version,
        setAsDefaultKey: true
      }
    });
    setAdminStatus(`Prompt '${templateKey}' v${version} wurde aktiviert.`);
    await loadAdminData({ silent: true });
  } catch (error) {
    setAdminStatus(error.message || "Prompt konnte nicht aktiviert werden.", true);
  }
}

function buildPolicyPayloadFromInputs(inputs) {
  const priority = toPositiveIntOrNull(inputs.priority);
  const maxOutputTokens = toPositiveIntOrNull(inputs.maxOutputTokens);
  const maxRetryOutputTokens = toPositiveIntOrNull(inputs.maxRetryOutputTokens);
  if (!priority || !maxOutputTokens || !maxRetryOutputTokens) {
    throw new Error("Prioritaet und Token-Werte muessen positive Zahlen sein.");
  }

  return {
    enabled: Boolean(inputs.enabled),
    priority,
    supportsWebSearch: Boolean(inputs.supportsWebSearch),
    searchContextSize: toText(inputs.searchContextSize) || "low",
    maxOutputTokens,
    maxRetryOutputTokens,
    enableStructuredOutput: Boolean(inputs.enableStructuredOutput)
  };
}

async function handleAdminCreatePolicy() {
  if (!adminDynamicConfigManagementEnabled) {
    setAdminStatus("Policy-Verwaltung ist per Feature-Flag deaktiviert.", true);
    return;
  }

  const modelId = toText(adminPolicyModelIdInput?.value);
  if (!modelId) {
    setAdminStatus("Bitte eine Model-ID eingeben.", true);
    return;
  }

  try {
    const payload = buildPolicyPayloadFromInputs({
      enabled: adminPolicyEnabledInput?.checked,
      priority: adminPolicyPriorityInput?.value,
      supportsWebSearch: adminPolicyWebSearchInput?.checked,
      searchContextSize: adminPolicySearchContextInput?.value,
      maxOutputTokens: adminPolicyMaxTokensInput?.value,
      maxRetryOutputTokens: adminPolicyMaxRetryTokensInput?.value,
      enableStructuredOutput: adminPolicyStructuredOutputInput?.checked
    });

    await adminRequest("/api/admin/model-policies", {
      method: "POST",
      body: {
        modelId,
        ...payload
      }
    });
    if (adminPolicyModelIdInput) adminPolicyModelIdInput.value = "";
    setAdminStatus(`Modell-Policy fuer '${modelId}' erstellt.`);
    await loadAdminData({ silent: true });
  } catch (error) {
    setAdminStatus(error.message || "Modell-Policy konnte nicht erstellt werden.", true);
  }
}

async function handleAdminSavePolicy(modelId, row) {
  if (!adminDynamicConfigManagementEnabled) {
    setAdminStatus("Policy-Verwaltung ist per Feature-Flag deaktiviert.", true);
    return;
  }

  const priorityInput = findAdminRowField(row, '[data-field="priority"]');
  const searchContextInput = findAdminRowField(row, '[data-field="searchContextSize"]');
  const maxOutputInput = findAdminRowField(row, '[data-field="maxOutputTokens"]');
  const maxRetryInput = findAdminRowField(row, '[data-field="maxRetryOutputTokens"]');
  const enabledInput = findAdminRowField(row, '[data-field="enabled"]');
  const webSearchInput = findAdminRowField(row, '[data-field="supportsWebSearch"]');
  const structuredInput = findAdminRowField(row, '[data-field="enableStructuredOutput"]');

  if (
    !priorityInput ||
    !searchContextInput ||
    !maxOutputInput ||
    !maxRetryInput ||
    !enabledInput ||
    !webSearchInput ||
    !structuredInput
  ) {
    setAdminStatus("Policy-Zeile ist unvollstaendig.", true);
    return;
  }

  try {
    const payload = buildPolicyPayloadFromInputs({
      enabled: enabledInput.checked,
      priority: priorityInput.value,
      supportsWebSearch: webSearchInput.checked,
      searchContextSize: searchContextInput.value,
      maxOutputTokens: maxOutputInput.value,
      maxRetryOutputTokens: maxRetryInput.value,
      enableStructuredOutput: structuredInput.checked
    });

    await adminRequest(`/api/admin/model-policies/${encodeURIComponent(modelId)}`, {
      method: "PATCH",
      body: payload
    });
    setAdminStatus(`Modell-Policy '${modelId}' gespeichert.`);
    await loadAdminData({ silent: true });
  } catch (error) {
    setAdminStatus(error.message || "Modell-Policy konnte nicht gespeichert werden.", true);
  }
}

async function handleAdminDeletePolicy(modelId) {
  if (!adminDynamicConfigManagementEnabled) {
    setAdminStatus("Policy-Verwaltung ist per Feature-Flag deaktiviert.", true);
    return;
  }

  const confirmed = window.confirm(`Modell-Policy '${modelId}' wirklich loeschen?`);
  if (!confirmed) return;

  try {
    await adminRequest(`/api/admin/model-policies/${encodeURIComponent(modelId)}`, {
      method: "DELETE"
    });
    setAdminStatus(`Modell-Policy '${modelId}' wurde geloescht.`);
    await loadAdminData({ silent: true });
  } catch (error) {
    setAdminStatus(error.message || "Modell-Policy konnte nicht geloescht werden.", true);
  }
}

async function handleAdminSaveFlagFromInputs(flagKey, values) {
  if (!adminFeatureFlagManagementEnabled) {
    setAdminStatus("Feature-Flag-Verwaltung ist im Read-only-Rollout deaktiviert.", true);
    return;
  }

  const rolloutPercent = toIntInRangeOrNull(values.rolloutPercent, 0, 100);
  if (rolloutPercent === null) {
    setAdminStatus("Rollout muss zwischen 0 und 100 liegen.", true);
    return;
  }

  let config;
  try {
    config = parseConfigJsonInput(values.configText);
  } catch (error) {
    setAdminStatus(error.message, true);
    return;
  }

  try {
    await adminRequest(`/api/admin/feature-flags/${encodeURIComponent(flagKey)}`, {
      method: "PUT",
      body: {
        enabled: Boolean(values.enabled),
        rolloutPercent,
        description: toText(values.description),
        config
      }
    });
    setAdminStatus(`Feature-Flag '${flagKey}' gespeichert.`);
    await loadAdminData({ silent: true });
  } catch (error) {
    setAdminStatus(error.message || "Feature-Flag konnte nicht gespeichert werden.", true);
  }
}

async function handleAdminCreateFlag() {
  const flagKey = toText(adminFlagKeyInput?.value);
  if (!flagKey) {
    setAdminStatus("Bitte einen Flag-Key eingeben.", true);
    return;
  }

  await handleAdminSaveFlagFromInputs(flagKey, {
    enabled: Boolean(adminFlagEnabledInput?.checked),
    rolloutPercent: adminFlagRolloutInput?.value,
    description: adminFlagDescriptionInput?.value,
    configText: adminFlagConfigInput?.value
  });
}

async function handleAdminSaveFlag(flagKey, row) {
  const rolloutInput = findAdminRowField(row, '[data-field="rolloutPercent"]');
  const enabledInput = findAdminRowField(row, '[data-field="enabled"]');
  const descriptionInput = findAdminRowField(row, '[data-field="description"]');
  const configInput = findAdminRowField(row, '[data-field="config"]');
  if (!rolloutInput || !enabledInput || !descriptionInput || !configInput) {
    setAdminStatus("Feature-Flag-Zeile ist unvollstaendig.", true);
    return;
  }

  await handleAdminSaveFlagFromInputs(flagKey, {
    enabled: enabledInput.checked,
    rolloutPercent: rolloutInput.value,
    description: descriptionInput.value,
    configText: configInput.value
  });
}

function resolveAdminActionButton(target) {
  if (!(target instanceof HTMLElement)) {
    return null;
  }
  return target.closest("button[data-admin-action]");
}

async function verifyKeyAndLoadModels() {
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    setStatus("Bitte zuerst einen API-Key eintragen.", true);
    return;
  }

  setButtonLoading(verifyBtn, "Prüfe...", true);
  searchBtn.disabled = true;
  modelSelect.disabled = true;
  modelSelect.innerHTML = '<option value="">Bitte warten...</option>';
  setStatus("API-Key wird geprüft...");

  try {
    const verifyRes = await fetchWithTimeout(
      "/api/verify-key",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey })
      },
      30000
    );
    const verifyJson = await parseJsonSafe(verifyRes);
    if (!verifyRes.ok || !verifyJson.ok) {
      throw new Error(verifyJson.message || "Verifizierung fehlgeschlagen.");
    }

    setStatus("Verifiziert. Modelle werden geladen...");

    const modelsRes = await fetchWithTimeout(
      "/api/models",
      {
        method: "GET",
        headers: { "x-openai-api-key": apiKey }
      },
      30000
    );
    const modelsJson = await parseJsonSafe(modelsRes);
    if (!modelsRes.ok || !modelsJson.ok) {
      throw new Error(modelsJson.message || "Modellliste konnte nicht geladen werden.");
    }

    const models = Array.isArray(modelsJson.models) ? modelsJson.models : [];
    modelSelect.innerHTML = "";

    if (!models.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "Keine Modelle verfügbar";
      modelSelect.appendChild(option);
      setStatus("Keine passenden Modelle gefunden.", true);
      searchBtn.disabled = true;
      return;
    }

    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "Bitte Modell wählen";
    modelSelect.appendChild(defaultOption);

    for (const model of models) {
      const option = document.createElement("option");
      option.value = model.id;
      option.textContent = model.id;
      modelSelect.appendChild(option);
    }

    modelSelect.disabled = false;
    lastVerifiedApiKey = apiKey;
    setStatus(`Verifiziert. ${models.length} Modelle geladen.`);
  } catch (error) {
    if (error?.name === "AbortError") {
      setStatus("Zeitüberschreitung bei der Verifizierung. Bitte erneut versuchen.", true);
    } else {
      setStatus(error.message || "Unbekannter Fehler.", true);
    }
    lastVerifiedApiKey = "";
    resetModelSelection();
  } finally {
    setButtonLoading(verifyBtn, "Prüfe...", false);
  }
}

async function searchTopics() {
  if (!categoryLabelsBySlug.size) {
    const loadedCategories = await loadCategories();
    if (!loadedCategories) {
      setStatus("Keine Kategorien verfuegbar. Bitte erneut versuchen.", true);
      return;
    }
  }

  const apiKey = apiKeyInput.value.trim();
  const model = modelSelect.value;
  const category = getSelectedCategory();
  const categoryLabel = getCategoryLabel(category);

  if (!apiKey || !model || !category) {
    setStatus("Bitte API-Key verifizieren, ein Modell und eine Kategorie auswählen.", true);
    return;
  }

  if (apiKey !== lastVerifiedApiKey) {
    setStatus("API-Key wurde geändert. Bitte erneut verifizieren.", true);
    resetModelSelection();
    return;
  }

  if (resultScrollFrameId !== null) {
    window.cancelAnimationFrame(resultScrollFrameId);
    resultScrollFrameId = null;
  }

  searchBtn.disabled = true;
  setButtonLoading(searchBtn, "Suche läuft...", true);
  if (categorySelect) {
    categorySelect.disabled = true;
  }
  setStatus(`Suche in Kategorie "${categoryLabel}" läuft...`);
  setActionStatus("");
  results.setAttribute("aria-busy", "true");
  results.classList.add("hidden");

  try {
    const response = await fetchWithTimeout(
      "/api/find-topics",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, model, category })
      },
      130000
    );
    const data = await parseJsonSafe(response);
    if (!response.ok || !data.ok) {
      throw new Error(data.message || "Themensuche fehlgeschlagen.");
    }

    latestResult = normalizeResultPayload(data);
    if (!latestResult.topics.length) {
      throw new Error("Es wurden keine Themen gefunden. Bitte erneut suchen.");
    }

    renderRecommendation(latestResult.bestRecommendation);
    renderTopics(latestResult.topics);
    resultActions.classList.remove("hidden");
    results.classList.remove("hidden");
    focusResults();
    const responseCategoryLabel = latestResult.categoryLabel || categoryLabel;
    setStatus(`Suche abgeschlossen mit Modell ${model} in Kategorie "${responseCategoryLabel}".`);
    await refreshHistory({ silent: true });
  } catch (error) {
    if (error?.name === "AbortError") {
      setStatus(
        "Die Anfrage hat zu lange gedauert. Bitte erneut suchen oder ein anderes Modell wählen.",
        true
      );
    } else {
      setStatus(error.message || "Themensuche fehlgeschlagen.", true);
    }
    resetResultView();
  } finally {
    results.setAttribute("aria-busy", "false");
    if (categorySelect) {
      categorySelect.disabled = false;
    }
    setButtonLoading(searchBtn, "Suche läuft...", false);
    searchBtn.disabled = !modelSelect.value;
  }
}

apiKeyInput.addEventListener("input", () => {
  if (apiKeyInput.value.trim() !== lastVerifiedApiKey) {
    lastVerifiedApiKey = "";
    resetModelSelection();
    resetResultView();
  }
});

modelSelect.addEventListener("change", () => {
  searchBtn.disabled = !modelSelect.value;
});

verifyBtn.addEventListener("click", verifyKeyAndLoadModels);
searchBtn.addEventListener("click", searchTopics);
copyBtn.addEventListener("click", handleCopy);
telegramBtn.addEventListener("click", handleSendTelegram);
whatsappBtn.addEventListener("click", handleSendWhatsApp);
exportJsonBtn.addEventListener("click", handleExportJson);
exportMdBtn.addEventListener("click", handleExportMarkdown);

if (refreshHistoryBtn) {
  refreshHistoryBtn.addEventListener("click", () => {
    void refreshHistory({ silent: false });
  });
}

if (historyList) {
  historyList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const action = target.dataset.action;
    const entryId = target.dataset.id;
    if (!action || !entryId) {
      return;
    }

    if (action === "load") {
      void loadHistoryEntry(entryId);
      return;
    }
    if (action === "delete") {
      void deleteHistoryEntry(entryId);
    }
  });
}

if (adminLoadBtn) {
  adminLoadBtn.addEventListener("click", () => {
    void loadAdminData({ silent: false });
  });
}

if (adminCreateCategoryBtn) {
  adminCreateCategoryBtn.addEventListener("click", () => {
    void handleAdminCreateCategory();
  });
}

if (adminCategoryList) {
  adminCategoryList.addEventListener("click", (event) => {
    const button = resolveAdminActionButton(event.target);
    if (!button) return;
    const action = button.dataset.adminAction;
    const slug = toText(button.dataset.slug);
    const row = button.closest(".admin-item");
    if (!row || !(row instanceof HTMLElement) || !action || !slug) {
      return;
    }
    if (action === "save-category") {
      void handleAdminSaveCategory(slug, row);
      return;
    }
    if (action === "deactivate-category") {
      void handleAdminDeactivateCategory(slug);
    }
  });
}

if (adminCreatePromptVersionBtn) {
  adminCreatePromptVersionBtn.addEventListener("click", () => {
    void handleAdminCreatePromptVersion();
  });
}

if (adminPromptList) {
  adminPromptList.addEventListener("click", (event) => {
    const button = resolveAdminActionButton(event.target);
    if (!button) return;
    if (button.dataset.adminAction !== "activate-prompt") {
      return;
    }
    const templateKey = toText(button.dataset.templateKey);
    const version = toPositiveIntOrNull(button.dataset.version);
    if (!templateKey || !version) {
      return;
    }
    void handleAdminActivatePrompt(templateKey, version);
  });
}

if (adminCreatePolicyBtn) {
  adminCreatePolicyBtn.addEventListener("click", () => {
    void handleAdminCreatePolicy();
  });
}

if (adminPolicyList) {
  adminPolicyList.addEventListener("click", (event) => {
    const button = resolveAdminActionButton(event.target);
    if (!button) return;
    const action = button.dataset.adminAction;
    const modelId = toText(button.dataset.modelId);
    const row = button.closest(".admin-item");
    if (!action || !modelId || !row || !(row instanceof HTMLElement)) {
      return;
    }
    if (action === "save-policy") {
      void handleAdminSavePolicy(modelId, row);
      return;
    }
    if (action === "delete-policy") {
      void handleAdminDeletePolicy(modelId);
    }
  });
}

if (adminSaveFlagBtn) {
  adminSaveFlagBtn.addEventListener("click", () => {
    void handleAdminCreateFlag();
  });
}

if (adminFlagList) {
  adminFlagList.addEventListener("click", (event) => {
    const button = resolveAdminActionButton(event.target);
    if (!button) return;
    if (button.dataset.adminAction !== "save-flag") {
      return;
    }
    const flagKey = toText(button.dataset.flagKey);
    const row = button.closest(".admin-item");
    if (!flagKey || !row || !(row instanceof HTMLElement)) {
      return;
    }
    void handleAdminSaveFlag(flagKey, row);
  });
}

renderHistory([]);
void loadCategories();
void refreshHistory({ silent: true });
