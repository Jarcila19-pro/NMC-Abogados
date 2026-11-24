// Pruebas unitarias del backend Apps Script. Sheets, Properties y LockService
// se simulan localmente; ninguna prueba accede a Google.
import { readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import vm from "node:vm";
import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";

const headers = [
  "ID",
  "Fecha de recepción",
  "Nombre",
  "Teléfono",
  "Correo",
  "Área de consulta",
  "Estado",
  "Fecha de seguimiento",
  "Responsable",
  "Fuente",
  "Idempotencia",
  "Versión de consentimiento",
];
const rows = [];
const cacheEntries = new Map();
const scriptProperties = new Map();
let hasSheet = true;
let lockHeld = false;
let beforeSetValues = null;
let uuidCounter = 0;

const sheet = {
  getLastRow: () => rows.length,
  getLastColumn() {
    return rows.reduce((lastColumn, row) => Math.max(lastColumn, row.length), 0);
  },
  getRange(row, column, rowCount, columnCount) {
    return {
      setValues(values) {
        if (row > 1 && beforeSetValues) {
          const callback = beforeSetValues;
          beforeSetValues = null;
          callback();
        }
        values.forEach((value, index) => {
          rows[row - 1 + index] = value.slice();
        });
      },
      getDisplayValues() {
        return Array.from({ length: rowCount }, (_, rowIndex) =>
          Array.from({ length: columnCount }, (_, columnIndex) =>
            String(rows[row - 1 + rowIndex]?.[column - 1 + columnIndex] ?? ""),
          ),
        );
      },
      getDisplayValue() {
        return String(rows[row - 1]?.[column - 1] ?? "");
      },
      createTextFinder(value) {
        return {
          matchEntireCell() {
            return this;
          },
          findNext() {
            const index = rows.findIndex(
              (entry, rowIndex) =>
                rowIndex >= row - 1 && String(entry[column - 1]) === String(value),
            );
            return index < 0 ? null : { getRow: () => index + 1 };
          },
        };
      },
    };
  },
};

const sandbox = {
  console: { error() {}, log() {} },
  URL,
  Date,
  String,
  JSON,
  RegExp,
  Object,
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: (name) => scriptProperties.get(name) || null,
    }),
  },
  SpreadsheetApp: {
    openById: () => ({
      getSheetByName: (name) => (hasSheet && name === "Registro de consultas" ? sheet : null),
    }),
    flush() {},
  },
  LockService: {
    getScriptLock: () => ({
      tryLock: () => {
        if (lockHeld) return false;
        lockHeld = true;
        return true;
      },
      releaseLock() {
        lockHeld = false;
      },
    }),
  },
  CacheService: {
    getScriptCache: () => ({
      get: (key) => cacheEntries.get(key) || null,
      put: (key, value) => cacheEntries.set(key, value),
    }),
  },
  Utilities: {
    DigestAlgorithm: { SHA_256: "SHA_256" },
    Charset: { UTF_8: "utf8" },
    computeDigest(_algorithm, value) {
      return [...createHash("sha256").update(value, "utf8").digest()].map((byte) =>
        byte > 127 ? byte - 256 : byte,
      );
    },
    getUuid() {
      uuidCounter += 1;
      return `${uuidCounter.toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`;
    },
  },
  ContentService: {
    MimeType: { JSON: "application/json" },
    createTextOutput(content) {
      return {
        setMimeType() {
          return this;
        },
        getContent: () => content,
      };
    },
  },
};

vm.createContext(sandbox);
vm.runInContext(readFileSync("integracion/apps-script/Code.gs", "utf8"), sandbox);

const settings = { consentVersion: "prueba-v1", enabled: true, notifyEmail: "" };
const valid = {
  nombre: "QA Ficticia",
  telefono: "+1 (202) 555-0100",
  email: "qa@example.test",
  servicio: "No especificado",
  consentimiento: true,
  consentVersion: "prueba-v1",
  claveIdempotencia: "nmc-00000000-0000-4000-8000-000000000001",
  website: "",
  mensaje: "texto libre que no se debe guardar",
};

function resetState({ tab = true, headerRow = headers } = {}) {
  rows.splice(0, rows.length, headerRow.slice());
  cacheEntries.clear();
  scriptProperties.clear();
  scriptProperties.set("REGISTRY_ENABLED", "true");
  scriptProperties.set("CONSENT_APPROVED", "true");
  scriptProperties.set("CONSENT_VERSION", "prueba-v1");
  scriptProperties.set("SPREADSHEET_ID", "fake-sheet");
  hasSheet = tab;
  lockHeld = false;
  beforeSetValues = null;
  uuidCounter = 0;
}

function post(payload) {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  return JSON.parse(
    sandbox.doPost({ postData: { contents: body } }).getContent(),
  );
}

function columnValue(row, header) {
  return row[headers.indexOf(header)];
}

function createClientCore(cryptoApi, randomValue) {
  const math = Object.create(Math);
  if (randomValue !== undefined) math.random = () => randomValue;
  const client = {
    console,
    URL,
    URLSearchParams,
    Date,
    Math: math,
    crypto: cryptoApi,
  };
  client.window = client;
  vm.createContext(client);
  vm.runInContext(readFileSync("js/form-core.js", "utf8"), client);
  return client.NMCFormCore;
}

beforeEach(() => resetState());

test("valida el esquema exacto de doce encabezados", () => {
  assert.equal(sheet.getLastColumn(), headers.length);
  assert.deepEqual(Array.from(sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0]), headers);
  assert.deepEqual(Array.from(sandbox.EXPECTED_HEADERS), headers);
  assert.deepEqual(Array.from(sandbox.getHeaders_(sheet)), headers);
  assert.equal(sandbox.getSheet_(), sheet);
});

test("rechaza encabezados faltantes, adicionales o desordenados", () => {
  const invalidSchemas = [
    headers.slice(0, 11),
    headers.concat("Columna extra"),
    [headers[1], headers[0], ...headers.slice(2)],
  ];

  for (const invalidHeaders of invalidSchemas) {
    resetState({ headerRow: invalidHeaders });
    const response = post(valid);
    assert.equal(response.code, "SERVER_ERROR");
    assert.equal(rows.length, 1);
  }
});

test("falla si no existe la pestaña requerida y no crea otra", () => {
  resetState({ tab: false });
  assert.equal(post(valid).code, "SERVER_ERROR");
  assert.throws(() => sandbox.setupSheet(), /No existe la pestaña requerida/);
  assert.equal(rows.length, 1);
});

test("setupSheet no renombra Hoja 1 si ya contiene registros", () => {
  let renamed = false;
  const tab = {
    getLastRow: () => 2,
    setName() {
      renamed = true;
    },
  };
  const originalOpenById = sandbox.SpreadsheetApp.openById;
  sandbox.SpreadsheetApp.openById = () => ({
    getSheetByName: (name) => (name === "Hoja 1" ? tab : null),
  });

  try {
    assert.throws(() => sandbox.setupSheet(), /contiene registros/);
    assert.equal(renamed, false);
  } finally {
    sandbox.SpreadsheetApp.openById = originalOpenById;
  }
});

test("acepta solo las áreas permitidas y usa No especificado si falta", () => {
  for (const area of ["Civil", "Comercial", "Familia", "Laboral", "No especificado"]) {
    assert.equal(sandbox.validate_({ ...valid, servicio: area }, settings), "", area);
  }
  assert.equal(sandbox.validate_({ ...valid, servicio: "" }, settings), "");
  assert.equal(sandbox.validate_({ ...valid, servicio: undefined }, settings), "");
  for (const area of ["Derecho Civil", "civil", "Otro"]) {
    assert.match(sandbox.validate_({ ...valid, servicio: area }, settings), /area de consulta/);
  }
});

test("exige consentimiento verdadero y la versión configurada", () => {
  assert.match(sandbox.validate_({ ...valid, consentimiento: false }, settings), /autorizacion/);
  const missingConsent = { ...valid };
  delete missingConsent.consentimiento;
  assert.match(sandbox.validate_(missingConsent, settings), /autorizacion/);
  assert.match(sandbox.validate_({ ...valid, consentVersion: "" }, settings), /version/);
  assert.match(sandbox.validate_({ ...valid, consentVersion: "otra" }, settings), /version/);
});

test("mantiene las compuertas apagadas cuando no están configuradas", () => {
  scriptProperties.delete("REGISTRY_ENABLED");
  scriptProperties.delete("CONSENT_APPROVED");
  const actual = sandbox.getSettings_();
  assert.equal(actual.enabled, false);
  assert.equal(actual.consentApproved, false);
  assert.equal(post(valid).code, "DISABLED");
});

test("valida campos requeridos del contacto y el honeypot", () => {
  assert.match(sandbox.validate_({ ...valid, website: "spam" }, settings), /Solicitud no valida/);
  assert.match(sandbox.validate_({ ...valid, nombre: "" }, settings), /nombre/);
  assert.match(sandbox.validate_({ ...valid, telefono: "123" }, settings), /telefono/);
  assert.match(sandbox.validate_({ ...valid, email: "ana@" }, settings), /correo/);
  assert.equal(post("not-json").code, "BAD_REQUEST");
});

test("acepta claves generadas por el cliente, incluido el respaldo", () => {
  const cryptoKey = createClientCore({ randomUUID }).makeIdempotencyKey();
  const fallbackKey = createClientCore(undefined, 0).makeIdempotencyKey();

  for (const key of [cryptoKey, fallbackKey]) {
    assert.equal(sandbox.validate_({ ...valid, claveIdempotencia: key }, settings), "");
  }
  for (const key of ["", "nmc-1", "nmc-2025550100", "abc@example.test"]) {
    assert.match(sandbox.validate_({ ...valid, claveIdempotencia: key }, settings), /clave/);
  }
});

test("rechaza claves incompatibles con el formato producido por el cliente", () => {
  assert.match(
    sandbox.validate_({ ...valid, claveIdempotencia: "nmc-1234-abcd" }, settings),
    /clave/,
  );
  assert.match(
    sandbox.validate_({ ...valid, claveIdempotencia: `nmc-${"a".repeat(101)}` }, settings),
    /clave/,
  );
});

test("neutraliza fórmulas en Sheets", () => {
  for (const value of ["=SUM(A1)", "+1", "-2", "@user", "\ttexto", "  =SUM(A1)", "\n=SUM(A1)"]) {
    assert.ok(sandbox.safeText_(value).startsWith("'"), value);
  }
  assert.equal(sandbox.safeText_("nombre normal"), "nombre normal");

  const response = post({ ...valid, nombre: " =NMC QA " });
  assert.equal(response.ok, true);
  assert.equal(columnValue(rows[1], "Nombre"), "'=NMC QA");
});

test("escribe por encabezado, conserva los campos operativos y omite el mensaje", () => {
  const response = post({
    ...valid,
    servicio: "Civil",
    email: " QA@Example.Test ",
    utmSource: "google",
    utmMedium: "cpc",
    utmCampaign: "search",
  });
  assert.equal(response.ok, true);
  assert.match(response.id, /^NMC-[A-F0-9]{32}$/);
  assert.equal(rows.length, 2);
  assert.deepEqual(Array.from(rows[0]), headers);

  const row = rows[1];
  assert.equal(row.length, headers.length);
  assert.equal(columnValue(row, "ID"), response.id);
  assert.ok(columnValue(row, "Fecha de recepción") instanceof Date);
  assert.equal(columnValue(row, "Nombre"), "QA Ficticia");
  assert.equal(columnValue(row, "Teléfono"), "'+1 (202) 555-0100");
  assert.equal(columnValue(row, "Correo"), "qa@example.test");
  assert.equal(columnValue(row, "Área de consulta"), "Civil");
  assert.equal(columnValue(row, "Estado"), "Nueva");
  assert.equal(columnValue(row, "Fecha de seguimiento"), "");
  assert.equal(columnValue(row, "Responsable"), "");
  assert.equal(columnValue(row, "Fuente"), "source=google | medium=cpc | campaign=search");
  assert.equal(columnValue(row, "Idempotencia"), valid.claveIdempotencia);
  assert.equal(columnValue(row, "Versión de consentimiento"), valid.consentVersion);
  assert.ok(!row.join("|").includes(valid.mensaje));
});

test("un reintento con la misma clave devuelve el mismo ID sin duplicar", () => {
  const first = post(valid);
  const duplicate = post(valid);
  assert.equal(first.ok, true);
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.duplicado, true);
  assert.equal(duplicate.id, first.id);
  assert.equal(rows.length, 2);
});

test("solicitudes concurrentes no crean filas duplicadas", () => {
  let concurrentResponse;
  beforeSetValues = () => {
    concurrentResponse = post(valid);
  };

  const first = post(valid);
  assert.equal(first.ok, true);
  assert.equal(concurrentResponse.code, "BUSY");
  assert.equal(rows.length, 2);

  const retry = post(valid);
  assert.equal(retry.duplicado, true);
  assert.equal(retry.id, first.id);
  assert.equal(rows.length, 2);
});

test("aplica el límite best-effort a registros nuevos por identidad", () => {
  assert.equal(post(valid).ok, true);
  assert.equal(post({ ...valid, claveIdempotencia: "nmc-00000000-0000-4000-8000-000000000002" }).code, "RATE_LIMITED");

  const otherContact = post({
    ...valid,
    nombre: "Otra Persona",
    telefono: "0000000000",
    email: "otra@example.test",
    claveIdempotencia: "nmc-00000000-0000-4000-8000-000000000003",
  });
  assert.equal(otherContact.ok, true);
  assert.equal(rows.length, 3);
});

test("doPost rechaza entradas inválidas y conserva cerradas las compuertas", () => {
  assert.equal(post({ ...valid, consentimiento: false }).code, "VALIDATION");
  assert.equal(post({ ...valid, consentVersion: "otra" }).code, "VALIDATION");
  assert.equal(post({ ...valid, website: "bot-filled" }).code, "VALIDATION");
  assert.equal(post({ ...valid, telefono: "abc2025550100" }).code, "VALIDATION");

  scriptProperties.set("CONSENT_APPROVED", "false");
  assert.equal(post(valid).code, "DISABLED");
  scriptProperties.set("CONSENT_APPROVED", "true");
  scriptProperties.set("REGISTRY_ENABLED", "false");
  assert.equal(post(valid).code, "DISABLED");
});

test("limpia textos y construye atribución sin datos sensibles", () => {
  assert.equal(sandbox.text_("  Ana \u0000  María  ", 20), "Ana María");
  assert.equal(sandbox.text_("x".repeat(100), 10), "x".repeat(10));
  assert.equal(
    sandbox.buildSource_({ utmSource: " GOOGLE ", utmMedium: "CPC", utmCampaign: "Search" }),
    "source=google | medium=cpc | campaign=search",
  );

  for (const payload of [
    {},
    { utmSource: "google", utmMedium: "cpc" },
    { utmSource: "qa@example.test", utmMedium: "cpc", utmCampaign: "search" },
    { utmSource: "google", utmMedium: "cpc", utmCampaign: "=IMPORTXML()" },
    { utmSource: "google", utmMedium: "display", utmCampaign: "search" },
    { utmSource: "google".repeat(100), utmMedium: "cpc", utmCampaign: "search" },
    { referrer: "https://example.test/caso?x=1" },
  ]) {
    assert.equal(sandbox.buildSource_(payload), "Sin atribucion");
  }
});
