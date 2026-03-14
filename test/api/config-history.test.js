const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

process.env.ADMIN_TOKEN = process.env.ADMIN_TOKEN || "test-admin-token";
process.env.LOG_SILENT = "true";

const runtimeConfigStore = require("../../src/db/runtime-config");
const historyStore = require("../../src/db/history-store");
const adminStore = require("../../src/db/admin-store");
const { startServer } = require("../../src/server");

const originalRuntimeConfig = {
  getRuntimeConfig: runtimeConfigStore.getRuntimeConfig,
  invalidateRuntimeConfigCache: runtimeConfigStore.invalidateRuntimeConfigCache
};
const originalHistoryStore = {
  listHistory: historyStore.listHistory,
  getHistoryEntryById: historyStore.getHistoryEntryById,
  deleteHistoryEntryById: historyStore.deleteHistoryEntryById,
  insertHistoryEntry: historyStore.insertHistoryEntry
};
const originalAdminStore = {
  readAppSettingString: adminStore.readAppSettingString,
  listAdminCategories: adminStore.listAdminCategories,
  createAdminCategory: adminStore.createAdminCategory,
  updateAdminCategory: adminStore.updateAdminCategory,
  deactivateAdminCategory: adminStore.deactivateAdminCategory,
  listPromptTemplatesAdmin: adminStore.listPromptTemplatesAdmin,
  createPromptTemplateVersion: adminStore.createPromptTemplateVersion,
  activatePromptTemplateVersion: adminStore.activatePromptTemplateVersion,
  listModelPoliciesAdmin: adminStore.listModelPoliciesAdmin,
  createModelPolicy: adminStore.createModelPolicy,
  updateModelPolicy: adminStore.updateModelPolicy,
  deleteModelPolicy: adminStore.deleteModelPolicy,
  listFeatureFlagsAdmin: adminStore.listFeatureFlagsAdmin,
  upsertFeatureFlag: adminStore.upsertFeatureFlag
};
const originalFetch = global.fetch;

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  };
}

async function withTestServer(run) {
  const server = startServer(0);
  try {
    return await run(request(server));
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

function createDefaultRuntimeConfig() {
  return {
    defaultCategory: "general_trends",
    categories: [
      {
        slug: "general_trends",
        label: "Allgemeine KI-Trends",
        instruction: "Trendfokus"
      }
    ],
    categoriesBySlug: {
      general_trends: {
        slug: "general_trends",
        label: "Allgemeine KI-Trends",
        instruction: "Trendfokus"
      }
    },
    modelPoliciesById: {},
    modelPolicies: [],
    settings: {
      modelTimeoutMs: 30000,
      searchTimeoutMs: 120000,
      topicCount: 5,
      articleAnglesCount: 3,
      focusPointsCount: 4
    },
    promptTemplate: {
      key: "topic_search_base",
      version: 1,
      templateText: "Prompt"
    },
    outputSchema: {
      key: "medium_tracker_topics",
      version: 1,
      strictMode: true,
      schema: {}
    },
    featureFlagsByKey: {
      category_admin_enabled: {
        flagKey: "category_admin_enabled",
        enabled: true,
        rolloutPercent: 100,
        config: {}
      },
      dynamic_config_enabled: {
        flagKey: "dynamic_config_enabled",
        enabled: true,
        rolloutPercent: 100,
        config: {}
      },
      admin_write_enabled: {
        flagKey: "admin_write_enabled",
        enabled: true,
        rolloutPercent: 100,
        config: {}
      },
      history_enabled: {
        flagKey: "history_enabled",
        enabled: true,
        rolloutPercent: 100,
        config: {}
      }
    }
  };
}

function resetMocks() {
  global.fetch = originalFetch;
  runtimeConfigStore.getRuntimeConfig = async () => createDefaultRuntimeConfig();
  runtimeConfigStore.invalidateRuntimeConfigCache = () => {};

  historyStore.listHistory = async ({ limit, offset }) => ({
    limit,
    offset,
    items: []
  });
  historyStore.getHistoryEntryById = async () => null;
  historyStore.deleteHistoryEntryById = async () => false;
  historyStore.insertHistoryEntry = async () => {};

  adminStore.readAppSettingString = async () => "general_trends";
  adminStore.listAdminCategories = async () => [];
  adminStore.createAdminCategory = async (input) => ({
    id: 1,
    slug: input.slug,
    label: input.label,
    instruction: input.instruction,
    isActive: Boolean(input.isActive),
    sortOrder: input.sortOrder ?? 100
  });
  adminStore.updateAdminCategory = async () => null;
  adminStore.deactivateAdminCategory = async () => null;

  adminStore.listPromptTemplatesAdmin = async () => ({ activeTemplateKey: "", items: [] });
  adminStore.createPromptTemplateVersion = async () => null;
  adminStore.activatePromptTemplateVersion = async () => null;
  adminStore.listModelPoliciesAdmin = async () => [];
  adminStore.createModelPolicy = async () => null;
  adminStore.updateModelPolicy = async () => null;
  adminStore.deleteModelPolicy = async () => false;
  adminStore.upsertFeatureFlag = async (input) => ({
    flagKey: input.flagKey,
    enabled: input.enabled ?? false,
    rolloutPercent: input.rolloutPercent ?? 100,
    description: input.description || "",
    config: input.config || {}
  });
  adminStore.listFeatureFlagsAdmin = async () => [
    {
      flagKey: "category_admin_enabled",
      enabled: true,
      rolloutPercent: 100,
      description: "",
      config: {}
    },
    {
      flagKey: "dynamic_config_enabled",
      enabled: true,
      rolloutPercent: 100,
      description: "",
      config: {}
    },
    {
      flagKey: "admin_write_enabled",
      enabled: true,
      rolloutPercent: 100,
      description: "",
      config: {}
    }
  ];
}

function restoreOriginals() {
  global.fetch = originalFetch;
  runtimeConfigStore.getRuntimeConfig = originalRuntimeConfig.getRuntimeConfig;
  runtimeConfigStore.invalidateRuntimeConfigCache =
    originalRuntimeConfig.invalidateRuntimeConfigCache;

  historyStore.listHistory = originalHistoryStore.listHistory;
  historyStore.getHistoryEntryById = originalHistoryStore.getHistoryEntryById;
  historyStore.deleteHistoryEntryById = originalHistoryStore.deleteHistoryEntryById;
  historyStore.insertHistoryEntry = originalHistoryStore.insertHistoryEntry;

  adminStore.readAppSettingString = originalAdminStore.readAppSettingString;
  adminStore.listAdminCategories = originalAdminStore.listAdminCategories;
  adminStore.createAdminCategory = originalAdminStore.createAdminCategory;
  adminStore.updateAdminCategory = originalAdminStore.updateAdminCategory;
  adminStore.deactivateAdminCategory = originalAdminStore.deactivateAdminCategory;
  adminStore.listPromptTemplatesAdmin = originalAdminStore.listPromptTemplatesAdmin;
  adminStore.createPromptTemplateVersion = originalAdminStore.createPromptTemplateVersion;
  adminStore.activatePromptTemplateVersion = originalAdminStore.activatePromptTemplateVersion;
  adminStore.listModelPoliciesAdmin = originalAdminStore.listModelPoliciesAdmin;
  adminStore.createModelPolicy = originalAdminStore.createModelPolicy;
  adminStore.updateModelPolicy = originalAdminStore.updateModelPolicy;
  adminStore.deleteModelPolicy = originalAdminStore.deleteModelPolicy;
  adminStore.listFeatureFlagsAdmin = originalAdminStore.listFeatureFlagsAdmin;
  adminStore.upsertFeatureFlag = originalAdminStore.upsertFeatureFlag;
}

test.beforeEach(() => {
  resetMocks();
});

test.after(() => {
  restoreOriginals();
});

test("GET /api/categories liefert dynamische Kategorien aus Runtime-Config", async () => {
  runtimeConfigStore.getRuntimeConfig = async () => ({
    ...createDefaultRuntimeConfig(),
    defaultCategory: "engineering_research",
    categories: [
      {
        slug: "engineering_research",
        label: "KI-Engineering & Forschung",
        instruction: "Engineering"
      }
    ]
  });

  const response = await withTestServer((api) =>
    api.get("/api/categories").expect(200)
  );
  assert.equal(response.body.ok, true);
  assert.equal(response.body.defaultCategory, "engineering_research");
  assert.equal(response.body.categories.length, 1);
  assert.equal(response.body.categories[0].slug, "engineering_research");
});

test("GET /health liefert gehaertete Sicherheits-Header", async () => {
  const response = await withTestServer((api) => api.get("/health").expect(200));
  assert.equal(response.headers["x-powered-by"], undefined);
  assert.equal(response.headers["x-content-type-options"], "nosniff");
  assert.equal(response.headers["x-frame-options"], "DENY");
  assert.equal(
    response.headers["referrer-policy"],
    "strict-origin-when-cross-origin"
  );
  assert.equal(response.headers["cross-origin-opener-policy"], "same-origin");
});

test("GET /api/categories leakt interne Serverfehler nicht nach aussen", async () => {
  runtimeConfigStore.getRuntimeConfig = async () => {
    throw new Error("postgres connection failed");
  };

  const response = await withTestServer((api) =>
    api.get("/api/categories").expect(500)
  );
  assert.equal(response.body.ok, false);
  assert.equal(
    response.body.message,
    "Kategorien konnten nicht geladen werden. Bitte spaeter erneut versuchen."
  );
});

test("GET /api/history nutzt limit/offset und liefert Verlauf", async () => {
  historyStore.listHistory = async ({ limit, offset }) => ({
    limit,
    offset,
    items: [{ id: 9, status: "success", model: "gpt-5.2" }]
  });

  const response = await withTestServer((api) =>
    api.get("/api/history?limit=12&offset=5").expect(200)
  );
  assert.equal(response.body.ok, true);
  assert.equal(response.body.limit, 12);
  assert.equal(response.body.offset, 5);
  assert.equal(response.body.items.length, 1);
  assert.equal(response.body.items[0].id, 9);
});

test("GET /api/history blockiert Zugriff wenn history Rollout deaktiviert ist", async () => {
  runtimeConfigStore.getRuntimeConfig = async () => ({
    ...createDefaultRuntimeConfig(),
    featureFlagsByKey: {
      ...createDefaultRuntimeConfig().featureFlagsByKey,
      history_enabled: {
        flagKey: "history_enabled",
        enabled: false,
        rolloutPercent: 0,
        config: {}
      }
    }
  });

  let listCalled = false;
  historyStore.listHistory = async () => {
    listCalled = true;
    return { limit: 20, offset: 0, items: [] };
  };

  const response = await withTestServer((api) => api.get("/api/history").expect(403));
  assert.equal(response.body.ok, false);
  assert.match(response.body.message, /verlauf ist aktuell deaktiviert/i);
  assert.equal(listCalled, false);
});

test("GET /api/history/:id liefert 404 fuer unbekannte IDs", async () => {
  historyStore.getHistoryEntryById = async () => null;
  const response = await withTestServer((api) =>
    api.get("/api/history/999").expect(404)
  );
  assert.equal(response.body.ok, false);
  assert.match(response.body.message, /nicht gefunden/i);
});

test("GET /api/admin/feature-flags zeigt Rollout-Status inkl. Write-Flag", async () => {
  adminStore.listFeatureFlagsAdmin = async () => [
    {
      flagKey: "category_admin_enabled",
      enabled: true,
      rolloutPercent: 100,
      description: "",
      config: {}
    },
    {
      flagKey: "dynamic_config_enabled",
      enabled: true,
      rolloutPercent: 100,
      description: "",
      config: {}
    },
    {
      flagKey: "admin_write_enabled",
      enabled: false,
      rolloutPercent: 0,
      description: "",
      config: {}
    }
  ];

  const response = await withTestServer((api) =>
    api
      .get("/api/admin/feature-flags")
      .set("x-admin-token", "test-admin-token")
      .expect(200)
  );

  assert.equal(response.body.ok, true);
  assert.equal(response.body.adminWriteEnabledForRequest, false);
  assert.equal(Array.isArray(response.body.flags), true);
});

test("POST /api/admin/categories blockiert Schreibzugriff im Read-only Rollout", async () => {
  let createCalled = false;
  adminStore.listFeatureFlagsAdmin = async () => [
    {
      flagKey: "category_admin_enabled",
      enabled: true,
      rolloutPercent: 100,
      description: "",
      config: {}
    },
    {
      flagKey: "dynamic_config_enabled",
      enabled: true,
      rolloutPercent: 100,
      description: "",
      config: {}
    },
    {
      flagKey: "admin_write_enabled",
      enabled: false,
      rolloutPercent: 0,
      description: "",
      config: {}
    }
  ];
  adminStore.createAdminCategory = async () => {
    createCalled = true;
    return null;
  };

  const response = await withTestServer((api) =>
    api
      .post("/api/admin/categories")
      .set("x-admin-token", "test-admin-token")
      .send({
        slug: "new_category",
        label: "Neue Kategorie",
        instruction: "Instruktion",
        sortOrder: 40,
        isActive: true
      })
      .expect(403)
  );

  assert.equal(response.body.ok, false);
  assert.match(response.body.message, /read-only/i);
  assert.equal(createCalled, false);
});

test("POST /api/admin/categories erstellt Kategorie wenn Write-Rollout aktiv", async () => {
  adminStore.listFeatureFlagsAdmin = async () => [
    {
      flagKey: "category_admin_enabled",
      enabled: true,
      rolloutPercent: 100,
      description: "",
      config: {}
    },
    {
      flagKey: "dynamic_config_enabled",
      enabled: true,
      rolloutPercent: 100,
      description: "",
      config: {}
    },
    {
      flagKey: "admin_write_enabled",
      enabled: true,
      rolloutPercent: 100,
      description: "",
      config: {}
    }
  ];
  adminStore.createAdminCategory = async (input) => ({
    id: 101,
    slug: input.slug,
    label: input.label,
    instruction: input.instruction,
    sortOrder: input.sortOrder,
    isActive: input.isActive
  });

  const response = await withTestServer((api) =>
    api
      .post("/api/admin/categories")
      .set("x-admin-token", "test-admin-token")
      .send({
        slug: "ai_governance",
        label: "AI Governance",
        instruction: "Fokus Governance",
        sortOrder: 40,
        isActive: true
      })
      .expect(201)
  );

  assert.equal(response.body.ok, true);
  assert.equal(response.body.category.slug, "ai_governance");
});

test("PUT /api/admin/feature-flags blockiert Schreibzugriff im Read-only Rollout", async () => {
  let upsertCalled = false;
  adminStore.listFeatureFlagsAdmin = async () => [
    {
      flagKey: "admin_write_enabled",
      enabled: false,
      rolloutPercent: 0,
      description: "",
      config: {}
    }
  ];
  adminStore.upsertFeatureFlag = async () => {
    upsertCalled = true;
    return null;
  };

  const response = await withTestServer((api) =>
    api
      .put("/api/admin/feature-flags/admin_write_enabled")
      .set("x-admin-token", "test-admin-token")
      .send({
        enabled: true,
        rolloutPercent: 100,
        config: {}
      })
      .expect(403)
  );

  assert.equal(response.body.ok, false);
  assert.match(response.body.message, /read-only/i);
  assert.equal(upsertCalled, false);
});

test("POST /api/verify-key liefert klare Meldung bei ungueltigem JSON", async () => {
  const response = await withTestServer((api) =>
    api
      .post("/api/verify-key")
      .set("content-type", "application/json")
      .send('{"apiKey":}')
      .expect(400)
  );

  assert.equal(response.body.ok, false);
  assert.equal(response.body.message, "Ungueltiges JSON im Request-Body.");
});

test("POST /api/verify-key funktioniert auch ohne geladene Runtime-Config", async () => {
  runtimeConfigStore.getRuntimeConfig = async () => {
    throw new Error("db unavailable");
  };

  let fetchCalled = false;
  global.fetch = async (url) => {
    fetchCalled = true;
    assert.match(String(url), /\/models$/);
    return jsonResponse({
      data: [{ id: "gpt-5", created: 100, owned_by: "openai" }]
    });
  };

  const response = await withTestServer((api) =>
    api
      .post("/api/verify-key")
      .send({ apiKey: "sk-test-123456" })
      .expect(200)
  );

  assert.equal(fetchCalled, true);
  assert.equal(response.body.ok, true);
});

test("GET /api/models faellt auf aktuelle Textmodelle zurueck wenn Runtime-Config fehlt", async () => {
  runtimeConfigStore.getRuntimeConfig = async () => {
    throw new Error("db unavailable");
  };

  global.fetch = async (url) => {
    assert.match(String(url), /\/models$/);
    return jsonResponse({
      data: [
        { id: "gpt-5", created: 300, owned_by: "openai" },
        { id: "gpt-5-mini", created: 200, owned_by: "openai" },
        { id: "text-embedding-3-large", created: 100, owned_by: "openai" }
      ]
    });
  };

  const response = await withTestServer((api) =>
    api
      .get("/api/models")
      .set("x-openai-api-key", "sk-test-123456")
      .expect(200)
  );

  assert.equal(response.body.ok, true);
  assert.equal(Array.isArray(response.body.models), true);
  assert.deepEqual(
    response.body.models.map((model) => model.id),
    ["gpt-5", "gpt-5-mini"]
  );
});

test("POST /api/find-topics nutzt aktuelle Responses-Websuche und liefert Quellen", async () => {
  const runtimeConfig = createDefaultRuntimeConfig();
  const policy = {
    modelId: "gpt-5.2",
    enabled: true,
    priority: 1,
    supportsWebSearch: true,
    searchContextSize: "medium",
    maxOutputTokens: 1800,
    maxRetryOutputTokens: 2600,
    enableStructuredOutput: true
  };

  runtimeConfig.modelPolicies = [policy];
  runtimeConfig.modelPoliciesById = {
    "gpt-5.2": policy
  };
  runtimeConfigStore.getRuntimeConfig = async () => runtimeConfig;

  let recordedHistoryEntry = null;
  historyStore.insertHistoryEntry = async (entry) => {
    recordedHistoryEntry = entry;
  };

  let capturedBody = null;
  global.fetch = async (url, options = {}) => {
    if (!String(url).endsWith("/responses")) {
      throw new Error(`Unexpected fetch URL: ${url}`);
    }

    capturedBody = JSON.parse(String(options.body || "{}"));
    return jsonResponse({
      status: "completed",
      output: [
        {
          type: "web_search_call",
          action: {
            type: "search",
            query: "Aktuelle KI-Themen",
            sources: [
              {
                type: "url",
                url: "https://example.com/openai-web-search"
              }
            ]
          }
        },
        {
          type: "message",
          role: "assistant",
          content: [
            {
              type: "output_text",
              text: JSON.stringify({
                topics: [
                  {
                    title: "Agentische Workflows",
                    why_now: "Neue Tooling-Welle",
                    complexity: "Hoch",
                    audience_potential: "Sehr hoch",
                    article_angles: ["A", "B", "C"]
                  }
                ],
                best_recommendation: {
                  topic_title: "Agentische Workflows",
                  headline: "Agenten im produktiven Einsatz",
                  summary: "Zusammenfassung",
                  focus_points: ["1", "2", "3", "4"]
                }
              }),
              annotations: [
                {
                  type: "url_citation",
                  title: "OpenAI Web Search Guide",
                  url: "https://example.com/openai-web-search"
                }
              ]
            }
          ]
        }
      ]
    });
  };

  const response = await withTestServer((api) =>
    api
      .post("/api/find-topics")
      .send({
        apiKey: "sk-test-123456",
        model: "gpt-5.2",
        category: "general_trends"
      })
      .expect(200)
  );

  assert.equal(capturedBody.model, "gpt-5.2");
  assert.equal(capturedBody.tools[0].type, "web_search");
  assert.equal(capturedBody.tools[0].search_context_size, "medium");
  assert.deepEqual(capturedBody.include, ["web_search_call.action.sources"]);
  assert.equal(capturedBody.tool_choice, "auto");
  assert.equal(Array.isArray(response.body.sources), true);
  assert.equal(response.body.sources.length, 1);
  assert.equal(response.body.sources[0].title, "OpenAI Web Search Guide");
  assert.equal(
    response.body.sources[0].url,
    "https://example.com/openai-web-search"
  );
  assert.ok(recordedHistoryEntry);
  assert.equal(recordedHistoryEntry.resultPayload.sources.length, 1);
});

test("POST /api/find-topics faellt ohne include zurueck wenn Quellen-include abgelehnt wird", async () => {
  const runtimeConfig = createDefaultRuntimeConfig();
  const policy = {
    modelId: "gpt-5.2",
    enabled: true,
    priority: 1,
    supportsWebSearch: true,
    searchContextSize: "low",
    maxOutputTokens: 1800,
    maxRetryOutputTokens: 2600,
    enableStructuredOutput: true
  };

  runtimeConfig.modelPolicies = [policy];
  runtimeConfig.modelPoliciesById = {
    "gpt-5.2": policy
  };
  runtimeConfigStore.getRuntimeConfig = async () => runtimeConfig;

  const requestBodies = [];
  global.fetch = async (url, options = {}) => {
    if (!String(url).endsWith("/responses")) {
      throw new Error(`Unexpected fetch URL: ${url}`);
    }

    const parsedBody = JSON.parse(String(options.body || "{}"));
    requestBodies.push(parsedBody);

    if (requestBodies.length === 1) {
      return jsonResponse(
        {
          error: {
            message: "Unsupported parameter: 'include'."
          }
        },
        400
      );
    }

    return jsonResponse({
      status: "completed",
      output: [
        {
          type: "message",
          role: "assistant",
          content: [
            {
              type: "output_text",
              text: JSON.stringify({
                topics: [
                  {
                    title: "Reasoning mit Websuche",
                    why_now: "Neue Responses-Optionen",
                    complexity: "Hoch",
                    audience_potential: "Hoch",
                    article_angles: ["A", "B", "C"]
                  }
                ],
                best_recommendation: {
                  topic_title: "Reasoning mit Websuche",
                  headline: "Responses API sauber migrieren",
                  summary: "Zusammenfassung",
                  focus_points: ["1", "2", "3", "4"]
                }
              }),
              annotations: [
                {
                  type: "url_citation",
                  title: "Fallback Source",
                  url: "https://example.com/fallback-source"
                }
              ]
            }
          ]
        }
      ]
    });
  };

  const response = await withTestServer((api) =>
    api
      .post("/api/find-topics")
      .send({
        apiKey: "sk-test-123456",
        model: "gpt-5.2",
        category: "general_trends"
      })
      .expect(200)
  );

  assert.equal(requestBodies.length, 2);
  assert.deepEqual(requestBodies[0].include, ["web_search_call.action.sources"]);
  assert.equal("include" in requestBodies[1], false);
  assert.equal(requestBodies[1].tool_choice, "auto");
  assert.equal(Array.isArray(response.body.sources), true);
  assert.equal(response.body.sources[0].title, "Fallback Source");
});
