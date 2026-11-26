import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import assert from "node:assert/strict";

function createRegistry(fetch, allowLocalRegistry = true) {
  const sandbox = {
    URL,
    AbortController,
    setTimeout,
    clearTimeout,
    fetch,
    NMC_CONFIG: {
      registryEndpoint: "http://127.0.0.1:8124/exec",
      registryTimeoutMs: 20,
      allowLocalRegistry,
    },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(readFileSync("js/registry.js", "utf8"), sandbox);
  return sandbox.NMCRegistry;
}

test("acepta solo respuestas con identificador de registro válido", async () => {
  let textReads = 0;
  const registry = createRegistry(async (_url, options) => {
    assert.equal(options.credentials, "omit");
    assert.equal(options.headers["Content-Type"], "text/plain;charset=utf-8");
    assert.equal(options.redirect, "follow");
    return {
      ok: true,
      async text() {
        textReads += 1;
        return JSON.stringify({ ok: true, id: "NMC-00000000000000000000000000000001" });
      },
    };
  });

  const result = await registry.submit({});
  assert.equal(result.ok, true);
  assert.equal(result.id, "NMC-00000000000000000000000000000001");
  assert.equal(textReads, 1);
});

test("rechaza HTTP local por defecto fuera del harness de pruebas", async () => {
  const registry = createRegistry(async () => {
    throw new Error("No debe intentar la conexión");
  }, false);
  await assert.rejects(registry.submit({}), (error) => error.code === "INSECURE_ENDPOINT");
});

test("trata JSON inválido y un ID no reconocido como resultado incierto", async () => {
  for (const body of ["<html>no</html>", JSON.stringify({ ok: true, id: "NMC-TEST" })]) {
    const registry = createRegistry(async () => ({
      ok: true,
      async text() {
        return body;
      },
    }));
    await assert.rejects(
      registry.submit({}),
      (error) => error.outcome === "uncertain" &&
        ["INVALID_RESPONSE", "REJECTED"].includes(error.code),
    );
  }
});

test("distingue un rechazo explícito de un error posterior al registro", async () => {
  const responses = [
    { body: { ok: false, code: "VALIDATION" }, outcome: "rejected" },
    { body: { ok: false, code: "SERVER_ERROR" }, outcome: "uncertain" },
  ];

  for (const { body, outcome } of responses) {
    const registry = createRegistry(async () => ({
      ok: true,
      async text() {
        return JSON.stringify(body);
      },
    }));
    await assert.rejects(
      registry.submit({}),
      (error) => error.outcome === outcome,
    );
  }
});

test("un fallo de red y una respuesta HTTP no exitosa son resultados inciertos", async () => {
  const networkRegistry = createRegistry(async () => {
    throw new TypeError("Failed to fetch");
  });
  await assert.rejects(
    networkRegistry.submit({}),
    (error) => error.code === "NETWORK" && error.outcome === "uncertain",
  );

  const httpRegistry = createRegistry(async () => ({ ok: false, status: 500 }));
  await assert.rejects(
    httpRegistry.submit({}),
    (error) => error.code === "HTTP_ERROR" && error.outcome === "uncertain",
  );
});

test("el timeout cubre también la lectura del cuerpo", async () => {
  const registry = createRegistry(async (_url, options) => ({
    ok: true,
    text() {
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener(
          "abort",
          () => reject(Object.assign(new Error("aborted"), { name: "AbortError", code: 20 })),
          { once: true },
        );
      });
    },
  }));

  const outcome = await Promise.race([
    registry.submit({}).then(
      () => "unexpected-success",
      (error) => ({ code: error.code, outcome: error.outcome }),
    ),
    new Promise((resolve) => setTimeout(() => resolve("still-pending"), 150)),
  ]);
  assert.deepEqual(outcome, { code: "TIMEOUT", outcome: "uncertain" });
});
