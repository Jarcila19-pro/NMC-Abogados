import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";

const SOURCE = readFileSync("integracion/apps-script/Code.gs", "utf8");
const HEADERS = [
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

function createRuntime() {
  const rows = [HEADERS];
  const logs = [];
  let cachePutAttempts = 0;
  const properties = {
    REGISTRY_ENABLED: "true",
    CONSENT_APPROVED: "true",
    CONSENT_VERSION: "NMC-CONSENT-1.0",
    SPREADSHEET_ID: "test-sheet",
  };
  const sheet = {
    getLastColumn: () => HEADERS.length,
    getLastRow: () => rows.length,
    getRange(row, column) {
      return {
        getDisplayValues: () => [HEADERS],
        getDisplayValue: () => String(rows[row - 1][column - 1] || ""),
        setValues(values) {
          rows.push(...values);
        },
        createTextFinder(value) {
          return {
            matchEntireCell() {
              return this;
            },
            findNext() {
              const index = rows.findIndex(
                (record, rowIndex) => rowIndex > 0 && record[column - 1] === value,
              );
              return index < 0 ? null : { getRow: () => index + 1 };
            },
          };
        },
      };
    },
  };
  const cache = {
    get: () => null,
    put() {
      cachePutAttempts += 1;
      throw new Error("cache unavailable");
    },
  };
  const context = {
    CacheService: { getScriptCache: () => cache },
    ContentService: {
      MimeType: { JSON: "application/json" },
      createTextOutput(content) {
        return {
          content,
          setMimeType() {
            return this;
          },
        };
      },
    },
    LockService: {
      getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }),
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (name) => properties[name] || "",
      }),
    },
    SpreadsheetApp: {
      openById: () => ({ getSheetByName: () => sheet }),
      flush() {},
    },
    Utilities: {
      Charset: { UTF_8: "UTF-8" },
      DigestAlgorithm: { SHA_256: "SHA-256" },
      computeDigest: () => [1, 2, 3, 4],
      getUuid: () => "12345678-1234-4123-8123-123456789abc",
    },
    console: { error: (...args) => logs.push(args.join(" ")) },
  };
  vm.createContext(context);
  vm.runInContext(SOURCE, context);

  const payload = {
    nombre: "QA Ficticia",
    telefono: "2025550100",
    email: "qa@example.test",
    servicio: "Civil",
    consentimiento: true,
    consentVersion: "NMC-CONSENT-1.0",
    claveIdempotencia: "nmc-12345678-1234-4123-8123-123456789abc",
    website: "",
  };

  return {
    cachePutAttempts: () => cachePutAttempts,
    logs,
    payload,
    rows,
    submit: () =>
      context.doPost({ postData: { contents: JSON.stringify(payload) } }),
  };
}

test("un fallo de caché después de guardar no rechaza la fila y el reintento no duplica", () => {
  const runtime = createRuntime();

  const first = JSON.parse(runtime.submit().content);
  assert.equal(first.ok, true);
  assert.equal(first.id, "NMC-12345678123441238123123456789ABC");
  assert.equal(runtime.rows.length, 2);
  assert.equal(runtime.cachePutAttempts(), 1);
  assert.ok(runtime.logs.some((entry) => entry.includes("limite de solicitudes")));

  const retry = JSON.parse(runtime.submit().content);
  assert.equal(retry.ok, true);
  assert.equal(retry.id, first.id);
  assert.equal(retry.duplicado, true);
  assert.equal(runtime.rows.length, 2);
  assert.equal(runtime.cachePutAttempts(), 1);
});
