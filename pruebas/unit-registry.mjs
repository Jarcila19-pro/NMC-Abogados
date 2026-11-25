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

test("rechaza JSON inválido y un ID no reconocido", async () => {
  for (const body of ["<html>no</html>", JSON.stringify({ ok: true, id: "NMC-TEST" })]) {
    const registry = createRegistry(async () => ({
      ok: true,
      async text() {
        return body;
      },
    }));
    await assert.rejects(registry.submit({}), /respuesta ilegible|registro rechazó/);
  }
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
      (error) => error.code,
    ),
    new Promise((resolve) => setTimeout(() => resolve("still-pending"), 150)),
  ]);
  assert.equal(outcome, "TIMEOUT");
});
