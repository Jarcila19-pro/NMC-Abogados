import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import assert from "node:assert/strict";

function createAnalytics(config, options = {}) {
  const appendedScripts = [];
  const listeners = {};
  const stored = new Map(options.stored || []);
  const sandbox = {
    console,
    URL,
    URLSearchParams,
    Set,
    Date,
    navigator: { doNotTrack: "0", msDoNotTrack: "0" },
    location: {
      href: "https://nmcabogada.com/",
      pathname: "/",
      search: options.search || "",
    },
    sessionStorage: {
      getItem: (key) => stored.get(key) || null,
      setItem: (key, value) => stored.set(key, value),
      removeItem: (key) => stored.delete(key),
    },
    document: {
      head: { appendChild: (element) => appendedScripts.push(element) },
      createElement: (tag) => ({ tag }),
      addEventListener: (name, callback) => {
        listeners[name] = callback;
      },
    },
    NMC_CONFIG: {
      analytics: config,
      attribution: { enabled: options.attributionEnabled === true },
    },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(readFileSync("js/analytics.js", "utf8"), sandbox);
  return { sandbox, appendedScripts, listeners, stored };
}

function clickEvent({ trusted = true, href = "https://wa.me/573000000000" } = {}) {
  const link = {
    href,
    getAttribute: () => null,
  };
  return {
    isTrusted: trusted,
    target: { closest: (selector) => (selector === "a[href]" ? link : null) },
  };
}

function events(sandbox) {
  return JSON.parse(JSON.stringify(sandbox.dataLayer));
}

function plainObject(value) {
  return JSON.parse(JSON.stringify(value));
}

test("GA4 requiere compuerta y consentimiento de analítica; no transmite datos personales", () => {
  const { sandbox, appendedScripts, listeners } = createAnalytics({
    enabled: true,
    consentGranted: false,
    ga4MeasurementId: "G-ABCD123456",
    adsConversionSendTo: "AW-123/abc",
    debug: false,
  });

  assert.equal(sandbox.NMCAnalytics.isEnabled(), false);
  assert.equal(appendedScripts.length, 0);
  listeners.click(clickEvent());
  sandbox.NMCAnalytics.trackRegistrationConfirmed(
    "evt-123e4567-e89b-42d3-a456-426614174000",
  );

  const payloads = events(sandbox);
  assert.deepEqual(
    payloads.map((event) => event.event),
    ["whatsapp_click", "consulta_registrada"],
  );
  for (const event of payloads) {
    for (const key of ["nombre", "telefono", "email", "mensaje", "gclid"]) {
      assert.ok(!(key in event), `${key} no debe aparecer en analítica`);
    }
  }
});

test("GA4 no registra automáticamente una URL con query", () => {
  const { sandbox, appendedScripts } = createAnalytics(
    {
      enabled: true,
      consentGranted: true,
      ga4MeasurementId: "G-ABCD123456",
      debug: false,
    },
    { search: "?email=qa%40example.test&gclid=fake-id" },
  );

  assert.equal(sandbox.NMCAnalytics.isEnabled(), true);
  assert.equal(appendedScripts.length, 1);
  const configCall = sandbox.dataLayer.find(
    (call) => call && call[0] === "config",
  );
  assert.equal(configCall[2].send_page_view, false);
  assert.ok(!JSON.stringify(sandbox.dataLayer).includes("qa@example.test"));
  assert.ok(!JSON.stringify(sandbox.dataLayer).includes("fake-id"));
});

test("whatsapp_click requiere un clic confiable en un enlace wa.me", () => {
  const { sandbox, listeners } = createAnalytics({ enabled: false });

  listeners.click(clickEvent({ trusted: false }));
  listeners.click(clickEvent({ href: "https://wa.me.attacker.test/123" }));
  listeners.click({
    isTrusted: true,
    target: { closest: () => null },
  });
  assert.deepEqual(events(sandbox), []);

  listeners.click(clickEvent({ trusted: true }));
  assert.deepEqual(
    events(sandbox).map((event) => event.event),
    ["whatsapp_click"],
  );
});

test("consulta_registrada se deduplica por transaction_id y rechaza IDs inválidos", () => {
  const { sandbox } = createAnalytics({ enabled: false });
  const transactionId = "evt-123e4567-e89b-42d3-a456-426614174000";

  assert.equal(sandbox.NMCAnalytics.trackRegistrationConfirmed(transactionId), true);
  assert.equal(sandbox.NMCAnalytics.trackRegistrationConfirmed(transactionId), false);
  assert.equal(sandbox.NMCAnalytics.trackRegistrationConfirmed("NMC-123"), false);
  assert.deepEqual(
    events(sandbox).map((event) => event.event),
    ["consulta_registrada"],
  );
  assert.equal(events(sandbox)[0].transaction_id, transactionId);
});

test("UTM guarda únicamente la combinación permitida y descarta gclid", () => {
  const { sandbox, stored } = createAnalytics(
    { enabled: false },
    {
      attributionEnabled: true,
      search:
        "?utm_source=%20Google%20&utm_medium=CPC&utm_campaign=Search&utm_term=divorcio&gclid=qa-test",
    },
  );

  assert.deepEqual(plainObject(sandbox.NMCAnalytics.getUtm()), {
    source: "google",
    medium: "cpc",
    campaign: "search",
  });
  assert.deepEqual(JSON.parse(stored.get("nmc_utm")), {
    source: "google",
    medium: "cpc",
    campaign: "search",
  });
});

test("UTM vacíos, inesperados, duplicados o personales se descartan", () => {
  const queries = [
    "",
    "?utm_source=google&utm_medium=cpc",
    "?utm_source=google&utm_medium=cpc&utm_campaign=search_familia",
    "?utm_source=qa%40example.test&utm_medium=cpc&utm_campaign=search",
    "?utm_source=google&utm_source=google&utm_medium=cpc&utm_campaign=search",
    "?gclid=opaque-id&utm_term=consulta%20de%20divorcio",
    `?utm_source=${"x".repeat(300)}&utm_medium=cpc&utm_campaign=search`,
  ];

  for (const search of queries) {
    const { sandbox, stored } = createAnalytics(
      { enabled: false },
      { attributionEnabled: true, search },
    );
    assert.deepEqual(plainObject(sandbox.NMCAnalytics.getUtm()), {}, search);
    assert.equal(stored.has("nmc_utm"), false, search);
  }
});

test("la atribución desactivada borra valores previamente guardados", () => {
  const { sandbox, stored } = createAnalytics(
    { enabled: false },
    {
      search: "?gclid=old",
      stored: [["nmc_utm", '{"source":"google","medium":"cpc","campaign":"search"}']],
    },
  );
  assert.equal(stored.has("nmc_utm"), false);
  assert.deepEqual(plainObject(sandbox.NMCAnalytics.getUtm()), {});
});
