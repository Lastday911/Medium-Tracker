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

let lastVerifiedApiKey = "";
let latestResult = null;
let resultScrollFrameId = null;
const CATEGORY_LABELS = {
  general_trends: "Allgemeine KI-Trends",
  engineering_research: "KI-Engineering & Forschung",
  business_strategy: "KI in Business & Produktivität"
};

function getSelectedCategory() {
  const category = categorySelect?.value || "";
  return Object.prototype.hasOwnProperty.call(CATEGORY_LABELS, category)
    ? category
    : "general_trends";
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
  const apiKey = apiKeyInput.value.trim();
  const model = modelSelect.value;
  const category = getSelectedCategory();
  const categoryLabel = CATEGORY_LABELS[category];

  if (!apiKey || !model || !categoryLabel) {
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
