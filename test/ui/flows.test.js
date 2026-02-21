const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const INDEX_HTML = fs.readFileSync(
  path.join(__dirname, "..", "..", "public", "index.html"),
  "utf8"
);
const APP_JS = fs.readFileSync(
  path.join(__dirname, "..", "..", "public", "app.js"),
  "utf8"
);

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  };
}

async function flushUi(ms = 0) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function setupUiTestContext(handler) {
  const dom = new JSDOM(INDEX_HTML, {
    url: "http://localhost/",
    runScripts: "outside-only",
    pretendToBeVisual: true
  });

  const { window } = dom;
  const requests = [];
  const openedUrls = [];
  const downloads = [];
  let clipboardText = "";

  window.fetch = async (url, options = {}) => {
    const method = String(options.method || "GET").toUpperCase();
    const pathWithQuery = new URL(String(url), "http://localhost").pathname +
      new URL(String(url), "http://localhost").search;
    const body = typeof options.body === "string" ? options.body : undefined;
    const req = {
      url: String(url),
      method,
      pathWithQuery,
      headers: options.headers || {},
      body
    };
    requests.push(req);
    return handler(req);
  };

  window.matchMedia = () => ({
    matches: false,
    media: "",
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false
  });
  window.scrollTo = () => {};
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
  window.cancelAnimationFrame = (id) => clearTimeout(id);
  window.open = (targetUrl) => {
    openedUrls.push(String(targetUrl));
    return { closed: false };
  };

  window.URL.createObjectURL = () => "blob:test";
  window.URL.revokeObjectURL = () => {};
  window.HTMLAnchorElement.prototype.click = function click() {
    downloads.push({
      download: this.download,
      href: this.href
    });
  };

  if (!window.navigator.clipboard) {
    window.navigator.clipboard = {};
  }
  window.navigator.clipboard.writeText = async (text) => {
    clipboardText = String(text);
  };

  window.eval(APP_JS);

  return {
    window,
    document: window.document,
    requests,
    openedUrls,
    downloads,
    getClipboardText: () => clipboardText,
    cleanup: () => window.close()
  };
}

test("Frontend-Flow: Verify -> Suche -> Copy/Share/Export", async () => {
  const api = setupUiTestContext((req) => {
    if (req.pathWithQuery === "/api/categories") {
      return jsonResponse({
        ok: true,
        defaultCategory: "general_trends",
        categories: [
          {
            slug: "general_trends",
            label: "Allgemeine KI-Trends",
            instruction: "Trendfokus"
          }
        ]
      });
    }
    if (req.pathWithQuery === "/api/history?limit=30") {
      return jsonResponse({ ok: true, limit: 30, offset: 0, items: [] });
    }
    if (req.pathWithQuery === "/api/verify-key" && req.method === "POST") {
      return jsonResponse({ ok: true, message: "Verifiziert" });
    }
    if (req.pathWithQuery === "/api/models" && req.method === "GET") {
      return jsonResponse({
        ok: true,
        models: [
          { id: "gpt-5.2", created: 100, ownedBy: "openai" }
        ]
      });
    }
    if (req.pathWithQuery === "/api/find-topics" && req.method === "POST") {
      return jsonResponse({
        ok: true,
        model: "gpt-5.2",
        category: "general_trends",
        categoryLabel: "Allgemeine KI-Trends",
        bestRecommendation: {
          topic_title: "Agentische Workflows",
          headline: "Agenten im produktiven Einsatz",
          summary: "Zusammenfassung",
          focus_points: ["Point 1", "Point 2", "Point 3", "Point 4"]
        },
        topics: [
          {
            title: "Topic 1",
            why_now: "Jetzt relevant",
            complexity: "Hoch",
            audience_potential: "Sehr hoch",
            article_angles: ["A", "B", "C"]
          },
          {
            title: "Topic 2",
            why_now: "Jetzt relevant",
            complexity: "Mittel",
            audience_potential: "Hoch",
            article_angles: ["A", "B", "C"]
          },
          {
            title: "Topic 3",
            why_now: "Jetzt relevant",
            complexity: "Mittel",
            audience_potential: "Hoch",
            article_angles: ["A", "B", "C"]
          },
          {
            title: "Topic 4",
            why_now: "Jetzt relevant",
            complexity: "Mittel",
            audience_potential: "Hoch",
            article_angles: ["A", "B", "C"]
          },
          {
            title: "Topic 5",
            why_now: "Jetzt relevant",
            complexity: "Mittel",
            audience_potential: "Hoch",
            article_angles: ["A", "B", "C"]
          }
        ]
      });
    }
    return jsonResponse({ ok: false, message: `Unhandled route ${req.method} ${req.pathWithQuery}` }, 500);
  });

  try {
    await flushUi();
    await flushUi();

    const { document, window } = api;
    const apiKeyInput = document.getElementById("apiKey");
    const verifyBtn = document.getElementById("verifyBtn");
    const modelSelect = document.getElementById("modelSelect");
    const searchBtn = document.getElementById("searchBtn");
    const results = document.getElementById("results");

    apiKeyInput.value = "sk-test-123456789";
    verifyBtn.click();
    await flushUi();
    await flushUi();

    assert.equal(modelSelect.disabled, false);
    assert.equal(modelSelect.options.length >= 2, true);

    modelSelect.value = "gpt-5.2";
    modelSelect.dispatchEvent(new window.Event("change"));
    searchBtn.click();
    await flushUi();
    await flushUi();
    await flushUi(5);

    assert.equal(results.classList.contains("hidden"), false);
    assert.equal(document.querySelectorAll("#topicList .topic").length, 5);

    document.getElementById("copyBtn").click();
    await flushUi();
    assert.match(api.getClipboardText(), /Top-Empfehlung/i);

    document.getElementById("telegramBtn").click();
    document.getElementById("whatsappBtn").click();
    assert.equal(api.openedUrls.some((url) => url.startsWith("https://t.me/share/url")), true);
    assert.equal(api.openedUrls.some((url) => url.startsWith("https://wa.me/?text=")), true);

    document.getElementById("exportJsonBtn").click();
    document.getElementById("exportMdBtn").click();
    assert.equal(
      api.downloads.some((entry) => entry.download === "medium-tracker-ergebnis.json"),
      true
    );
    assert.equal(
      api.downloads.some((entry) => entry.download === "medium-tracker-ergebnis.md"),
      true
    );
  } finally {
    api.cleanup();
  }
});

test("Frontend-Flow: Verlauf laden und loeschen", async () => {
  const api = setupUiTestContext((req) => {
    if (req.pathWithQuery === "/api/categories") {
      return jsonResponse({
        ok: true,
        defaultCategory: "general_trends",
        categories: [
          {
            slug: "general_trends",
            label: "Allgemeine KI-Trends",
            instruction: "Trendfokus"
          }
        ]
      });
    }
    if (req.pathWithQuery === "/api/history?limit=30") {
      return jsonResponse({
        ok: true,
        limit: 30,
        offset: 0,
        items: [
          {
            id: 7,
            status: "success",
            model: "gpt-5.2",
            category: "general_trends",
            categoryLabel: "Allgemeine KI-Trends",
            createdAt: new Date().toISOString(),
            latencyMs: 420,
            errorMessage: null,
            topicCount: 5,
            bestTopicTitle: "Agentische Workflows"
          }
        ]
      });
    }
    if (req.pathWithQuery === "/api/history/7" && req.method === "GET") {
      return jsonResponse({
        ok: true,
        item: {
          id: 7,
          status: "success",
          resultPayload: {
            model: "gpt-5.2",
            category: "general_trends",
            categoryLabel: "Allgemeine KI-Trends",
            bestRecommendation: {
              topic_title: "Agentische Workflows",
              headline: "Headline",
              summary: "Summary",
              focus_points: ["1", "2", "3", "4"]
            },
            topics: [
              {
                title: "Topic 1",
                why_now: "Jetzt",
                complexity: "Hoch",
                audience_potential: "Hoch",
                article_angles: ["A", "B", "C"]
              }
            ]
          }
        }
      });
    }
    if (req.pathWithQuery === "/api/history/7" && req.method === "DELETE") {
      return jsonResponse({ ok: true });
    }
    return jsonResponse({ ok: false, message: `Unhandled route ${req.method} ${req.pathWithQuery}` }, 500);
  });

  try {
    await flushUi();
    await flushUi();

    const { document } = api;
    const loadButton = document.querySelector('button[data-action="load"][data-id="7"]');
    const deleteButton = document.querySelector('button[data-action="delete"][data-id="7"]');
    assert.ok(loadButton);
    assert.ok(deleteButton);

    loadButton.click();
    await flushUi();
    await flushUi();
    assert.equal(document.getElementById("results").classList.contains("hidden"), false);

    deleteButton.click();
    await flushUi();
    await flushUi();
    assert.equal(
      api.requests.some((req) => req.pathWithQuery === "/api/history/7" && req.method === "DELETE"),
      true
    );
  } finally {
    api.cleanup();
  }
});

test("Frontend-Flow: Admin-Feature-Flags sind im Read-only-Rollout deaktiviert", async () => {
  const api = setupUiTestContext((req) => {
    if (req.pathWithQuery === "/api/categories") {
      return jsonResponse({
        ok: true,
        defaultCategory: "general_trends",
        categories: [
          {
            slug: "general_trends",
            label: "Allgemeine KI-Trends",
            instruction: "Trendfokus"
          }
        ]
      });
    }
    if (req.pathWithQuery === "/api/history?limit=30") {
      return jsonResponse({ ok: true, limit: 30, offset: 0, items: [] });
    }
    if (req.pathWithQuery === "/api/admin/feature-flags" && req.method === "GET") {
      return jsonResponse({
        ok: true,
        categoryAdminEnabledForRequest: true,
        dynamicConfigEnabledForRequest: true,
        adminWriteEnabledForRequest: false,
        flags: [
          {
            flagKey: "admin_write_enabled",
            enabled: false,
            rolloutPercent: 0,
            description: "",
            config: {}
          }
        ]
      });
    }
    if (req.pathWithQuery === "/api/admin/categories" && req.method === "GET") {
      return jsonResponse({
        ok: true,
        managementEnabled: true,
        defaultCategory: "general_trends",
        categories: []
      });
    }
    if (req.pathWithQuery === "/api/admin/prompt-templates" && req.method === "GET") {
      return jsonResponse({
        ok: true,
        managementEnabled: true,
        activeTemplateKey: "topic_search_base",
        items: []
      });
    }
    if (req.pathWithQuery === "/api/admin/model-policies" && req.method === "GET") {
      return jsonResponse({
        ok: true,
        managementEnabled: true,
        items: []
      });
    }
    return jsonResponse({ ok: false, message: `Unhandled route ${req.method} ${req.pathWithQuery}` }, 500);
  });

  try {
    await flushUi();
    await flushUi();

    const { document } = api;
    const adminTokenInput = document.getElementById("adminToken");
    const adminLoadBtn = document.getElementById("adminLoadBtn");

    adminTokenInput.value = "test-admin-token";
    adminLoadBtn.click();
    await flushUi();
    await flushUi();

    const saveCreateFlagBtn = document.getElementById("adminSaveFlagBtn");
    const saveExistingFlagBtn = document.querySelector(
      'button[data-admin-action="save-flag"][data-flag-key="admin_write_enabled"]'
    );
    assert.ok(saveCreateFlagBtn);
    assert.ok(saveExistingFlagBtn);
    assert.equal(saveCreateFlagBtn.disabled, true);
    assert.equal(saveExistingFlagBtn.disabled, true);
    assert.match(document.getElementById("adminStatus").textContent, /nur lesbar/i);

    saveCreateFlagBtn.click();
    saveExistingFlagBtn.click();
    await flushUi();
    assert.equal(
      api.requests.some(
        (req) =>
          req.method === "PUT" &&
          req.pathWithQuery.startsWith("/api/admin/feature-flags/")
      ),
      false
    );
  } finally {
    api.cleanup();
  }
});
