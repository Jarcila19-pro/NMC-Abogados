// Pruebas unitarias de las funciones puras del formulario (sin navegador).
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import assert from "node:assert/strict";

const sandbox = {
  console,
  crypto: globalThis.crypto,
  TextEncoder,
  URL,
  URLSearchParams,
  Date,
  Math,
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(readFileSync("js/form-core.js", "utf8"), sandbox);
const core = sandbox.NMCFormCore;

const base = {
  nombre: "  Ana   María  ",
  telefono: "202-555-0100",
  email: "  ANA@Example.COM ",
  servicio: "Civil",
  consentimiento: true,
};

test("sanitiza los datos de contacto y omite cualquier mensaje libre", () => {
  const data = core.sanitize({ ...base, mensaje: "RELATO LEGAL PRIVADO" });
  assert.equal(data.nombre, "Ana María");
  assert.equal(data.email, "ana@example.com");
  assert.equal(data.telefono, "202-555-0100");
  assert.equal(data.servicio, "Civil");
  assert.equal(data.consentimiento, true);
  assert.ok(!Object.hasOwn(data, "mensaje"));
});

test("rechaza campos vacíos", () => {
  const result = core.validate({ consentimiento: false });
  assert.equal(result.valid, false);
  assert.ok(result.errors.nombre);
  assert.ok(result.errors.telefono);
  assert.ok(result.errors.email);
  assert.ok(result.errors.servicio);
  assert.ok(result.errors.consentimiento);
});

test("rechaza teléfono con pocos dígitos", () => {
  const result = core.validate({ ...base, telefono: "12345" });
  assert.equal(result.valid, false);
  assert.match(result.errors.telefono, /7 y 15 dígitos/);
});

test("rechaza teléfono con demasiados dígitos", () => {
  const result = core.validate({ ...base, telefono: "1234567890123456" });
  assert.equal(result.valid, false);
  assert.ok(result.errors.telefono);
});

test("rechaza email inválido", () => {
  for (const email of ["ana", "ana@", "ana@dominio", "ana@dominio.", "a b@x.com"]) {
    const result = core.validate({ ...base, email });
    assert.equal(result.valid, false, email);
    assert.ok(result.errors.email);
  }
});

test("exige consentimiento explícito", () => {
  const without = core.validate({ ...base, consentimiento: false });
  assert.equal(without.valid, false);
  assert.ok(without.errors.consentimiento);

  const withConsent = core.validate(base);
  assert.equal(withConsent.valid, true);
});

test("acepta caracteres especiales en el nombre y un área permitida", () => {
  const result = core.validate({
    ...base,
    nombre: "José Núñez-Peña",
    servicio: "Laboral",
  });
  assert.equal(result.valid, true);
  assert.equal(result.data.nombre, "José Núñez-Peña");
  assert.equal(result.data.servicio, "Laboral");
});

test("limita el nombre a su máximo", () => {
  const result = core.validate({
    ...base,
    nombre: "a".repeat(200),
  });
  assert.equal(result.data.nombre.length, core.LIMITS.nombreMax);
  assert.equal(result.valid, true);
});

test("rechaza valores de área que el backend no permite", () => {
  for (const servicio of ["", "Laboral y Seguridad Social", "Otra consulta", "Legal"]) {
    const result = core.validate({ ...base, servicio });
    assert.equal(result.valid, false, servicio);
    assert.ok(result.errors.servicio);
  }
});

test("mapea las cinco etiquetas del selector a valores del contrato", () => {
  const mappings = [
    ["Familia", "Familia"],
    ["Civil", "Civil"],
    ["Comercial", "Comercial"],
    ["Laboral y Seguridad Social", "Laboral"],
    ["Otra consulta", "No especificado"],
  ];

  for (const [_label, servicio] of mappings) {
    const result = core.validate({ ...base, servicio });
    assert.equal(result.valid, true, servicio);
    assert.equal(core.buildPayload(result.data).servicio, servicio);
  }
});

test("huella SHA-256 identifica los datos enviados y excluye el mensaje libre", async () => {
  const meta = {
    consentVersion: "v1",
    utm: { source: "google", medium: "cpc", campaign: "search" },
  };
  const a = await core.signature(base, meta);
  const b = await core.signature(
    { ...base, nombre: "Ana María", email: "ana@example.com" },
    meta,
  );
  assert.equal(a, b);
  assert.equal(a, await core.signature({ ...base, mensaje: "RELATO LEGAL PRIVADO" }, meta));
  assert.notEqual(a, await core.signature({ ...base, telefono: "3001112233" }, meta));
  assert.notEqual(a, await core.signature({ ...base, servicio: "Familia" }, meta));
  assert.notEqual(a, await core.signature(base, { ...meta, consentVersion: "v2" }));
  assert.notEqual(a, await core.signature(base, { ...meta, utm: {} }));
  assert.match(a, /^sha256-[a-f0-9]{64}$/);
  assert.ok(!a.includes("Ana") && !a.includes("2025550100") && !a.includes("asesoría"));
});

test("falla cerrado si Web Crypto no está disponible", async () => {
  const isolated = {
    console,
    crypto: {},
    TextEncoder,
    URL,
    URLSearchParams,
    Date,
    Math,
  };
  isolated.window = isolated;
  vm.createContext(isolated);
  vm.runInContext(readFileSync("js/form-core.js", "utf8"), isolated);

  await assert.rejects(
    isolated.NMCFormCore.signature(base),
    (error) => error.code === "IDEMPOTENCY_UNAVAILABLE",
  );
});

test("clave de idempotencia única", () => {
  const keys = new Set(Array.from({ length: 20 }, () => core.makeIdempotencyKey()));
  assert.equal(keys.size, 20);
  for (const key of keys) assert.match(key, /^nmc-/);
});

test("el transaction ID de analítica es opaco y no reutiliza la clave de consulta", () => {
  const ids = new Set(Array.from({ length: 20 }, () => core.makeAnalyticsTransactionId()));
  assert.equal(ids.size, 20);
  for (const id of ids) {
    assert.match(
      id,
      /^evt-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    assert.ok(!id.startsWith("NMC-"));
  }
});

test("URL de WhatsApp contiene solo un saludo genérico", () => {
  const url = core.buildWhatsAppUrl("573146153979");
  assert.ok(url.startsWith("https://wa.me/573146153979?text="));
  const text = new URL(url).searchParams.get("text");
  assert.equal(text, "Hola, quisiera solicitar información.");
  for (const value of [
    base.nombre.trim(),
    "202-555-0100",
    "ana@example.com",
    "RELATO LEGAL PRIVADO",
    "NMC-2026-0001",
  ]) {
    assert.ok(!text.includes(value), `WhatsApp no debe prellenar ${value}`);
  }
});

test("el payload omite cualquier mensaje libre y conserva solo atribución operativa", () => {
  const payload = core.buildPayload({ ...base, mensaje: "RELATO LEGAL PRIVADO" }, {
    consentVersion: "v1",
    idioma: "es-CO",
    utm: { source: "google", medium: "cpc", campaign: "search", gclid: "abc" },
    gclid: "abc",
    key: "nmc-1",
  });
  assert.equal(payload.consentimiento, true);
  assert.equal(payload.consentVersion, "v1");
  assert.equal(payload.utmSource, "google");
  assert.equal(payload.utmMedium, "cpc");
  assert.equal(payload.utmCampaign, "search");
  assert.equal(payload.claveIdempotencia, "nmc-1");
  assert.equal(payload.website, "");
  assert.ok(!Object.hasOwn(payload, "mensaje"), "el mensaje libre no debe registrarse");
  for (const key of ["pagina", "idioma", "gclid", "referrer", "utmTerm", "utmContent", "timestamp", "telefonoDigitos"]) {
    assert.ok(!Object.hasOwn(payload, key), `${key} no debe transmitirse al registro`);
  }
});

test("el payload neutraliza atribución inesperada, maliciosa o vacía", () => {
  for (const utm of [
    {},
    { source: "google", medium: "cpc", campaign: "" },
    { source: "qa@example.test", medium: "cpc", campaign: "search" },
    { source: "google", medium: "cpc", campaign: "=IMPORTXML()" },
    { source: "google", medium: "display", campaign: "search" },
  ]) {
    const payload = core.buildPayload(base, { utm });
    assert.equal(payload.utmSource, "");
    assert.equal(payload.utmMedium, "");
    assert.equal(payload.utmCampaign, "");
  }
});

test("incluye el honeypot en el payload sin incluir el mensaje libre", () => {
  const payload = core.buildPayload({ ...base, mensaje: "RELATO LEGAL PRIVADO" }, {
    key: "nmc-1",
    website: "bot-filled",
  });
  assert.equal(payload.website, "bot-filled");
  assert.ok(!Object.hasOwn(payload, "mensaje"));
});

