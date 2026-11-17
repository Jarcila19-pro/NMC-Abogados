// Driver mínimo de Chrome DevTools Protocol (sin dependencias externas).
// Usa Microsoft Edge ya instalado. Destinado a pruebas locales del sitio.
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

export async function launchBrowser() {
  const profile = await mkdtemp(path.join(tmpdir(), "nmc-edge-"));
  const proc = spawn(
    EDGE,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--hide-scrollbars",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );

  const wsUrl = await new Promise((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(
      () => reject(new Error(`Edge no inició a tiempo: ${buffer}`)),
      20000,
    );
    proc.stderr.on("data", (chunk) => {
      buffer += chunk.toString();
      const match = buffer.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    proc.on("exit", (code) =>
      reject(new Error(`Edge terminó con código ${code}: ${buffer}`)),
    );
  });

  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  let nextId = 0;
  const pending = new Map();
  const handlers = new Map();

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result);
      return;
    }
    for (const handler of handlers.get(message.method) || []) handler(message);
  };

  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      ws.send(
        JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }),
      );
    });

  const on = (method, handler) => {
    if (!handlers.has(method)) handlers.set(method, []);
    handlers.get(method).push(handler);
  };

  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", {
    targetId,
    flatten: true,
  });

  const page = {
    send: (method, params) => send(method, params, sessionId),
    on: (method, handler) =>
      on(method, (message) => {
        if (message.sessionId === sessionId) handler(message);
      }),
  };

  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Log.enable");
  await page.send("Network.enable");

  return {
    page,
    async goto(url) {
      await page.send("Page.navigate", { url });
      const deadline = Date.now() + 25000;
      while (Date.now() < deadline) {
        const { result } = await page.send("Runtime.evaluate", {
          expression: "document.readyState",
          returnByValue: true,
        });
        if (result.value === "complete") return;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error(`Tiempo de carga agotado: ${url}`);
    },
    async evaluate(expression) {
      const { result, exceptionDetails } = await page.send("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
        userGesture: true,
      });
      if (exceptionDetails) {
        throw new Error(
          exceptionDetails.exception?.description || exceptionDetails.text,
        );
      }
      return result.value;
    },
    async setViewport(width, height) {
      await page.send("Emulation.setDeviceMetricsOverride", {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: width < 600,
      });
    },
    async screenshot(file, { fullPage = true } = {}) {
      let clip;
      if (fullPage) {
        const { cssContentSize } = await page.send("Page.getLayoutMetrics");
        clip = {
          x: 0,
          y: 0,
          width: Math.ceil(cssContentSize.width),
          height: Math.min(Math.ceil(cssContentSize.height), 16000),
          scale: 1,
        };
      }
      const { data } = await page.send("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: fullPage,
        ...(clip ? { clip } : {}),
      });
      await writeFile(file, Buffer.from(data, "base64"));
    },
    async close() {
      try {
        await send("Browser.close");
      } catch {
        /* el navegador puede cerrarse antes de responder */
      }
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      await new Promise((resolve) => {
        if (proc.exitCode !== null) return resolve();
        proc.once("exit", resolve);
        setTimeout(resolve, 5000);
      });
      await rm(profile, { recursive: true, force: true }).catch(() => {});
    },
  };
}
