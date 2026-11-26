// Pruebas del flujo de captación: consentimiento, registro, errores,
// reintentos, honeypot y apertura segura de WhatsApp.
// Usa un registro simulado local: no es una integración real de producción.
import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { launchBrowser } from "./cdp.mjs";

const BASE = process.env.NMC_URL || "http://127.0.0.1:8123/";
const OUT = process.env.NMC_OUTPUT_DIR || "pruebas/salidas";
const results = [];
const consoleErrors = [];
const failedRequests = [];

const MOCK_PORT = 8124;
const MOCK = `http://127.0.0.1:${MOCK_PORT}`;
const receivedPayloads = [];
const retryPayloads = [];
const changedRequestPayloads = [];
let retryCount = 0;
let changedRequestCount = 0;
let postRequests = 0;

function check(name, condition, detail = "") {
  results.push({ name, ok: Boolean(condition), detail });
}

const server = createServer(async (req, res) => {
  if (req.method === "POST") postRequests += 1;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString("utf8");
  let payload = null;
  if (body) {
    try {
      payload = JSON.parse(body);
      receivedPayloads.push({ url: req.url, payload });
    } catch {
      /* Las pruebas de respuesta inválida no dependen del cuerpo. */
    }
  }

  const json = (status, body) => {
    res.writeHead(status, {
      "Content-Type": "application/json;charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(JSON.stringify(body));
  };
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    });
    res.end();
    return;
  }
  if (req.url === "/ok") return json(200, { ok: true, id: "NMC-00000000000000000000000000000001", fecha: "2026-11-17T15:00:00Z" });
  if (req.url === "/duplicate") return json(200, { ok: true, id: "NMC-00000000000000000000000000000002", duplicado: true });
  if (req.url === "/reject") return json(200, { ok: false, code: "VALIDATION", message: "Datos incompletos" });
  if (req.url === "/error") return json(500, { ok: false });
  if (req.url === "/badid") return json(200, { ok: true, id: "NOT-A-VALID-ID" });
  if (req.url === "/retry") {
    retryPayloads.push(payload);
    retryCount += 1;
    if (retryCount === 1) {
      // The closed local port simulates a transport failure without a real service.
      res.writeHead(307, {
        "Access-Control-Allow-Origin": "*",
        Location: "http://127.0.0.1:8125/unavailable",
      });
      res.end();
      return;
    }
    return json(200, { ok: true, id: "NMC-00000000000000000000000000000003" });
  }
  if (req.url === "/change-key") {
    changedRequestPayloads.push(payload);
    changedRequestCount += 1;
    if (changedRequestCount === 1) return json(500, { ok: false });
    return json(200, { ok: true, id: "NMC-00000000000000000000000000000006" });
  }
  if (req.url === "/wait") {
    setTimeout(() => json(200, { ok: true, id: "NMC-00000000000000000000000000000005" }), 700);
    return;
  }
  if (req.url === "/garbage") {
    res.writeHead(200, { "Content-Type": "text/html", "Access-Control-Allow-Origin": "*" });
    res.end("<html>OK</html>");
    return;
  }
  if (req.url === "/slow") {
    setTimeout(() => json(200, { ok: true, id: "NMC-00000000000000000000000000000004" }), 3000);
    return;
  }
  json(404, { ok: false, code: "NOT_FOUND" });
});
await new Promise((resolve) => server.listen(MOCK_PORT, "127.0.0.1", resolve));

await mkdir(OUT, { recursive: true });
const browser = await launchBrowser();
const { page } = browser;
const requestUrls = new Map();
page.on("Network.requestWillBeSent", (message) => requestUrls.set(message.params.requestId, message.params.request.url));
page.on("Network.loadingFailed", (message) =>
  failedRequests.push(`${message.params.errorText} ${requestUrls.get(message.params.requestId) || ""}`),
);
page.on("Runtime.exceptionThrown", (m) =>
  consoleErrors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text),
);
page.on("Log.entryAdded", (m) => {
  if (m.params.entry.level !== "error") return;
  const entry = m.params.entry;
  // Los fallos del registro simulado son intencionales en estas pruebas.
  if (String(entry.text || "").startsWith("Failed to load resource:")) return;
  if (
    String(entry.url || "").includes(":8124/") ||
    String(entry.text || "").includes(`${MOCK}/retry`)
  ) return;
  consoleErrors.push(entry.text);
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function statusText() {
  return browser.evaluate("document.querySelector('#cf-form-status').textContent.trim()");
}

async function eventCount(name) {
  return browser.evaluate(
    `window.dataLayer.filter(event => event.event === ${JSON.stringify(name)}).length`,
  );
}

async function waitForStatus(fragment, timeout = 6000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const text = await statusText();
    if (text.includes(fragment)) return text;
    await sleep(120);
  }
  return await statusText();
}

async function prepare(pageConfig) {
  await browser.goto(BASE);
  await browser.evaluate("sessionStorage.clear(); localStorage.clear();");
  await browser.goto(BASE);
  await browser.evaluate(`(() => {
    window.__opened = null;
    window.__openedCount = 0;
    window.__lastPopup = null;
    window.__warnings = [];
    console.warn = (...args) => window.__warnings.push(args.map(String).join(" "));
    window.open = () => {
      window.__openedCount++;
      const popup = {
        closed: false,
        opener: null,
        document: { title: "", body: { textContent: "", style: { cssText: "" } } },
        location: { replace(url) { window.__opened = url; } },
        close() { this.closed = true; }
      };
      window.__lastPopup = popup;
      return popup;
    };
    Object.assign(window.NMC_CONFIG, { consentApproved: true, allowLocalRegistry: true }, ${JSON.stringify(pageConfig)});
  })()`);
}

async function fill(values = {}) {
  const data = {
    nombre: "QA Ficticia",
    telefono: "2025550100",
    email: "qa@example.test",
    mensaje: "MENSAJE FICTICIO DE PRUEBA",
    ...values,
  };
  await browser.evaluate(`(() => {
    const values = ${JSON.stringify(data)};
    for (const [id, value] of Object.entries(values)) {
      const field = document.querySelector("#cf-" + id);
      field.value = value;
      field.dispatchEvent(new Event("input", { bubbles: true }));
    }
    const consent = document.querySelector("#cf-consent");
    if (!consent.checked) {
      consent.checked = true;
      consent.dispatchEvent(new Event("change", { bubbles: true }));
    }
  })()`);
}

try {
  // 1. Sin consentimiento, el navegador impide el envío.
  await prepare({});
  await browser.evaluate(`(() => {
    const f = document.querySelector("#cf-whatsapp-form");
    f.querySelector("#cf-nombre").value = "Ana";
    f.querySelector("#cf-telefono").value = "2025550100";
    f.querySelector("#cf-email").value = "qa@example.test";
    f.querySelector("#cf-mensaje").value = "Consulta";
    f.querySelector(".cf-btn").click();
  })()`);
  const nativeBlocked = await browser.evaluate(`(() => {
    const c = document.querySelector("#cf-consent");
    return { valid: c.checkValidity(), missing: c.validity.valueMissing, status: document.querySelector("#cf-form-status").textContent.trim() };
  })()`);
  check("Sin consentimiento el envío se bloquea", !nativeBlocked.valid && nativeBlocked.missing && nativeBlocked.status === "");
  check("El consentimiento está marcado como obligatorio", await browser.evaluate(`document.querySelector("#cf-consent").required`));

  // 2. El perfil safe muestra WhatsApp sin enviar los datos del formulario.
  await prepare({
    consentApproved: false,
    consentVersion: "",
    registryEndpoint: "",
    allowLocalRegistry: false,
  });
  await fill();
  const requestsBeforeGate = postRequests;
  await browser.evaluate(`document.querySelector(".cf-btn").click()`);
  const gate = await waitForStatus("El formulario todavía no está disponible");
  const safeContact = await browser.evaluate(`(() => {
    const status = document.querySelector("#cf-form-status");
    const link = status.querySelector("a");
    return {
      message: status.textContent,
      href: link ? link.href : "",
      label: link ? link.textContent : "",
      target: link ? link.target : "",
      rel: link ? link.rel : "",
      openedCount: window.__openedCount,
    };
  })()`);
  const safeWhatsApp = new URL(safeContact.href);
  check("El perfil safe informa que el formulario no está disponible y no enviará datos", gate.includes("No se enviarán los datos que ingresaste."));
  check("La alternativa es un enlace directo a WhatsApp con saludo genérico", safeWhatsApp.origin === "https://wa.me" && safeWhatsApp.pathname === "/573146153979" && safeWhatsApp.searchParams.get("text") === "Hola, quisiera solicitar información." && safeContact.label === "Escribir por WhatsApp" && safeContact.target === "_blank" && safeContact.rel.includes("noopener"));
  check("El enlace de WhatsApp no contiene datos introducidos", !/QA Ficticia|2025550100|qa@example\.test|MENSAJE FICTICIO/.test(safeContact.href));
  check("WhatsApp no se abre automáticamente", safeContact.openedCount === 0);
  check("Sin texto aprobado no hay peticiones de registro", postRequests === requestsBeforeGate);

  await prepare({
    consentApproved: false,
    consentVersion: "prueba-v1",
    registryEndpoint: `${MOCK}/ok`,
  });
  await fill();
  const requestsBeforeApproval = postRequests;
  await browser.evaluate(`document.querySelector(".cf-btn").click()`);
  const approvalGate = await waitForStatus("El formulario todavía no está disponible");
  check("Una versión configurada no basta sin aprobación explícita", approvalGate.includes("No se enviarán los datos que ingresaste.") && postRequests === requestsBeforeApproval);
  check("La aprobación pendiente no abre WhatsApp", (await browser.evaluate("window.__openedCount")) === 0);

  // 3. Registro exitoso: apertura de WhatsApp con saludo genérico.
  await prepare({ consentVersion: "prueba-v1", registryEndpoint: `${MOCK}/ok`, registryTimeoutMs: 2000 });
  await fill();
  await browser.evaluate(`document.querySelector(".cf-btn").click()`);
  const success = await waitForStatus("Consulta registrada");
  const opened = await browser.evaluate("window.__opened");
  check("El registro exitoso informa el identificador", success.includes("NMC-00000000000000000000000000000001"), success);
  check("WhatsApp se abre solo después del registro", typeof opened === "string" && opened.startsWith("https://wa.me/573146153979?"));
  const whatsappText = typeof opened === "string" ? new URL(opened).searchParams.get("text") : "";
  check("WhatsApp prellena solo el saludo genérico", whatsappText === "Hola, quisiera solicitar información.");
  check("WhatsApp no prellena datos personales ni el relato", !/QA Ficticia|2025550100|qa@example\.test|MENSAJE FICTICIO|NMC-00000000000000000000000000000001/.test(whatsappText));
  check("Se indica pulsar Enviar dentro de WhatsApp", success.includes("pulsa «Enviar»"));
  check("El registro confirmado emite una sola consulta registrada", await eventCount("consulta_registrada") === 1);
  check("Abrir WhatsApp programáticamente no emite un clic real", await eventCount("whatsapp_click") === 0);
  check("El botón vuelve a estar disponible", (await browser.evaluate(`!document.querySelector(".cf-btn").disabled`)));
  const submittedPayload = receivedPayloads.find((entry) => entry.url === "/ok")?.payload;
  check("El registro omite el mensaje libre y envía el honeypot vacío", !!submittedPayload && !Object.hasOwn(submittedPayload, "mensaje") && submittedPayload.website === "" && submittedPayload.consentimiento === true);

  // 4. El doble clic concurrente se bloquea, pero una nueva consulta tras éxito usa otra clave.
  await prepare({ consentVersion: "prueba-v1", registryEndpoint: `${MOCK}/wait`, registryTimeoutMs: 2000 });
  await fill();
  const requestsBeforeDoubleClick = postRequests;
  await browser.evaluate(`(() => {
    const button = document.querySelector(".cf-btn");
    button.click();
    button.click();
  })()`);
  const doubleClickSuccess = await waitForStatus("Consulta registrada");
  const waitPayloads = () => receivedPayloads.filter((entry) => entry.url === "/wait");
  const firstWaitKey = waitPayloads()[0]?.payload.claveIdempotencia;
  check("El doble clic concurrente produce un solo POST", postRequests === requestsBeforeDoubleClick + 1);
  check("El doble clic concurrente abre WhatsApp una sola vez", (await browser.evaluate("window.__openedCount")) === 1);
  check("La primera consulta se confirma", doubleClickSuccess.includes("Consulta registrada"));

  await browser.evaluate(`document.querySelector(".cf-btn").click()`);
  const secondInquiry = await waitForStatus("Consulta registrada");
  const secondWaitKey = waitPayloads()[1]?.payload.claveIdempotencia;
  check("Una nueva consulta del mismo contacto genera otro POST", postRequests === requestsBeforeDoubleClick + 2);
  check("Una nueva consulta del mismo contacto obtiene clave nueva", !!firstWaitKey && !!secondWaitKey && firstWaitKey !== secondWaitKey);
  check("La nueva consulta también abre WhatsApp tras confirmación", secondInquiry.includes("Consulta registrada") && (await browser.evaluate("window.__openedCount")) === 2);

  // 5. Respuesta del servidor con ok:false.
  await prepare({ consentVersion: "prueba-v1", registryEndpoint: `${MOCK}/reject`, registryTimeoutMs: 2000 });
  await fill();
  await browser.evaluate(`document.querySelector(".cf-btn").click()`);
  const rejected = await waitForStatus("No pudimos registrar");
  check("Un rechazo del registro se informa con honestidad", rejected.includes("Tus datos siguen en el formulario"));
  check("Un rechazo no navega a WhatsApp y cierra la ventana", await browser.evaluate("window.__opened === null && !!window.__lastPopup && window.__lastPopup.closed === true"));
  check("Un rechazo conserva los datos", (await browser.evaluate(`document.querySelector("#cf-mensaje").value`)).includes("FICTICIO"));
  check("Un rechazo no emite consulta registrada", await eventCount("consulta_registrada") === 0);

  // 6. Error HTTP 500.
  await prepare({ consentVersion: "prueba-v1", registryEndpoint: `${MOCK}/error`, registryTimeoutMs: 2000 });
  await fill();
  await browser.evaluate(`document.querySelector(".cf-btn").click()`);
  const httpError = await waitForStatus("No pudimos registrar");
  check("El error HTTP se informa como fallo", httpError.includes("reintenta") && !httpError.includes("registrada con"));
  check("El error HTTP no navega a WhatsApp", await browser.evaluate("window.__opened === null"));
  check("El error HTTP no emite consulta registrada", await eventCount("consulta_registrada") === 0);

  // 7. Respuesta ilegible no se interpreta como éxito.
  await prepare({ consentVersion: "prueba-v1", registryEndpoint: `${MOCK}/garbage`, registryTimeoutMs: 2000 });
  await fill();
  await browser.evaluate(`document.querySelector(".cf-btn").click()`);
  const garbage = await waitForStatus("No pudimos registrar");
  check("Una respuesta ilegible no se toma como éxito", !garbage.includes("Consulta registrada") && garbage.includes("Tus datos siguen"));
  check("Una respuesta ilegible no navega a WhatsApp", await browser.evaluate("window.__opened === null"));
  check("Una respuesta ilegible no emite consulta registrada", await eventCount("consulta_registrada") === 0);

  // 8. Tiempo de espera agotado.
  await prepare({ consentVersion: "prueba-v1", registryEndpoint: `${MOCK}/slow`, registryTimeoutMs: 600 });
  await fill();
  await browser.evaluate(`document.querySelector(".cf-btn").click()`);
  const timeout = await waitForStatus("tardó demasiado", 8000);
  const timeoutWarnings = await browser.evaluate("window.__warnings.join(' | ')");
  check("El timeout se informa y no se da por registrado", timeout.includes("tardó demasiado") && !timeout.includes("Consulta registrada"), `${timeout} | ${timeoutWarnings}`);
  check("El timeout conserva los datos", (await browser.evaluate(`document.querySelector("#cf-nombre").value`)) === "QA Ficticia");
  check("El timeout no emite consulta registrada", await eventCount("consulta_registrada") === 0);

  // 9. Ventana emergente bloqueada: se ofrece enlace manual tras registrar.
  await prepare({ consentVersion: "prueba-v1", registryEndpoint: `${MOCK}/ok`, registryTimeoutMs: 2000 });
  await browser.evaluate("window.open = () => null");
  await fill();
  await browser.evaluate(`document.querySelector(".cf-btn").click()`);
  const blocked = await waitForStatus("bloqueó la ventana");
  const manualLink = await browser.evaluate(`(() => {
    const a = document.querySelector("#cf-form-status a");
    return a ? a.href : "";
  })()`);
  check("Con ventana bloqueada se informa el registro", blocked.includes("NMC-00000000000000000000000000000001"));
  check("Con ventana bloqueada se ofrece enlace manual", manualLink.startsWith("https://wa.me/573146153979?"));
  check("Mostrar el enlace manual no emite un clic de WhatsApp", await eventCount("whatsapp_click") === 0);

  // 10. Honeypot: se descarta sin llamar al registro.
  await prepare({ consentVersion: "prueba-v1", registryEndpoint: `${MOCK}/ok`, registryTimeoutMs: 2000 });
  await fill();
  await browser.evaluate(`document.querySelector("#cf-website").value = "spam"`);
  await browser.evaluate(`document.querySelector(".cf-btn").click()`);
  const honeypot = await waitForStatus("No se pudo procesar");
  check("El honeypot descarta el envío", honeypot.includes("No se pudo procesar"));
  check("El honeypot no abre WhatsApp", (await browser.evaluate("window.__openedCount")) === 0);
  check("El honeypot no emite consulta registrada", await eventCount("consulta_registrada") === 0);

  // 11. Datos especiales y relato largo no se prellenan en WhatsApp.
  await prepare({ consentVersion: "prueba-v1", registryEndpoint: `${MOCK}/duplicate`, registryTimeoutMs: 2000 });
  await fill({
    nombre: "José Núñez-Peña",
    mensaje: "¿Qué pasa con «mi caso»? — 50 % + $1.000 & <b>no</b>. " + "Detalle ".repeat(120),
  });
  await browser.evaluate(`document.querySelector(".cf-btn").click()`);
  const special = await waitForStatus("Consulta registrada");
  const specialUrl = await browser.evaluate("window.__opened");
  check("Un mensaje largo y con caracteres especiales se registra", special.includes("NMC-00000000000000000000000000000002"));
  const specialText = new URL(specialUrl).searchParams.get("text");
  check("El enlace conserva el saludo genérico", specialText === "Hola, quisiera solicitar información.");
  check("Nombre y relato especial no se prellenan", !specialText.includes("José Núñez-Peña") && !specialText.includes("¿Qué pasa con"));

  // 12. Una respuesta positiva sin identificador válido no confirma el registro.
  await prepare({ consentVersion: "prueba-v1", registryEndpoint: `${MOCK}/badid` });
  await fill();
  await browser.evaluate(`document.querySelector(".cf-btn").click()`);
  const badId = await waitForStatus("No pudimos registrar");
  check("Una respuesta con ID inválido se rechaza", badId.includes("Tus datos siguen") && !badId.includes("registrada"));
  check("Un ID inválido no navega a WhatsApp", await browser.evaluate("window.__opened === null && !!window.__lastPopup && window.__lastPopup.closed === true"));
  check("Un ID inválido no emite consulta registrada", await eventCount("consulta_registrada") === 0);

  // 13. Un error de red conserva la clave para reintentar la misma solicitud.
  await prepare({ consentVersion: "prueba-v1", registryEndpoint: `${MOCK}/retry`, registryTimeoutMs: 2000 });
  await fill();
  await browser.evaluate(`document.querySelector(".cf-btn").click()`);
  const retryFailure = await waitForStatus("No pudimos conectar");
  const firstRetryKey = retryPayloads[0]?.claveIdempotencia;
  const pendingStorage = await browser.evaluate("sessionStorage.getItem('nmc_idem')");
  await browser.evaluate(`document.querySelector(".cf-btn").click()`);
  const retrySuccess = await waitForStatus("Consulta registrada");
  const retryKeyPreserved = !!firstRetryKey && retryPayloads.length === 2 && retryPayloads[1].claveIdempotencia === firstRetryKey;
  check("El reintento conserva la misma clave idempotente", retryKeyPreserved, retryKeyPreserved ? "" : `payloads=${retryPayloads.length}`);
  check("La huella almacenada no contiene el mensaje ni datos en claro", !!pendingStorage && !pendingStorage.includes("MENSAJE FICTICIO") && !pendingStorage.includes("QA Ficticia") && JSON.parse(pendingStorage).sig.startsWith("sha256-"), pendingStorage ? "" : "sin huella pendiente");
  check("El reintento solo habilita WhatsApp tras confirmación", retryFailure.includes("reintenta") && retrySuccess.includes("NMC-00000000000000000000000000000003") && new URL(await browser.evaluate("window.__opened")).searchParams.get("text") === "Hola, quisiera solicitar información.", `${retryFailure} | ${retrySuccess}`);

  // 14. Cambiar datos relevantes después de un error requiere una clave nueva.
  await prepare({ consentVersion: "prueba-v1", registryEndpoint: `${MOCK}/change-key`, registryTimeoutMs: 2000 });
  await fill();
  await browser.evaluate(`document.querySelector(".cf-btn").click()`);
  await waitForStatus("No pudimos registrar");
  const originalChangedKey = changedRequestPayloads[0]?.claveIdempotencia;
  await fill({ email: "otra@example.test" });
  await browser.evaluate(`document.querySelector(".cf-btn").click()`);
  const changedRequestSuccess = await waitForStatus("Consulta registrada");
  check("Cambiar datos relevantes genera una clave de idempotencia nueva", !!originalChangedKey && changedRequestPayloads.length === 2 && changedRequestPayloads[1].claveIdempotencia !== originalChangedKey);
  check("La consulta con datos modificados completa el flujo de éxito", changedRequestSuccess.includes("NMC-00000000000000000000000000000006") && typeof await browser.evaluate("window.__opened") === "string");

  // 15. Una respuesta lenta no abre WhatsApp antes de confirmar el registro.
  await prepare({ consentVersion: "prueba-v1", registryEndpoint: `${MOCK}/wait`, registryTimeoutMs: 2000 });
  await fill();
  await browser.evaluate(`document.querySelector(".cf-btn").click()`);
  await sleep(100);
  check("WhatsApp no se configura antes de la confirmación", (await browser.evaluate("window.__opened")) === null);
  const delayedSuccess = await waitForStatus("Consulta registrada");
  const delayedUrl = await browser.evaluate("window.__opened");
  check("La confirmación válida permite continuar a WhatsApp", delayedSuccess.includes("NMC-00000000000000000000000000000005") && typeof delayedUrl === "string" && delayedUrl.includes("wa.me/573146153979"), `${delayedSuccess} | ${delayedUrl}`);

  // 16. Navegación por teclado: el formulario es alcanzable y el estado recibe foco.
  await prepare({ consentVersion: "prueba-v1", registryEndpoint: `${MOCK}/ok`, registryTimeoutMs: 2000 });
  await fill();
  await browser.evaluate(`document.querySelector("#cf-consent").focus()`);
  const focused = await browser.evaluate("document.activeElement.id");
  check("El consentimiento es accesible por teclado", focused === "cf-consent");
  await browser.evaluate(`document.querySelector(".cf-btn").click()`);
  await waitForStatus("Consulta registrada");
  const statusFocused = await browser.evaluate("document.activeElement.id");
  check("El estado del formulario recibe el foco", statusFocused === "cf-form-status");

  check("Sin excepciones de JavaScript en el flujo", consoleErrors.length === 0, `${consoleErrors.join(" | ")}${failedRequests.length ? ` | fallos de red: ${failedRequests.join(" | ")}` : ""}`);
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((r) => !r.ok);
await writeFile(`${OUT}/resultados-formulario.json`, JSON.stringify({ fecha: new Date().toISOString(), results }, null, 2));
for (const r of results) console.log(`${r.ok ? "OK  " : "FALLA"} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
console.log(`\n${results.length - failed.length}/${results.length} comprobaciones correctas`);
process.exitCode = failed.length ? 1 : 0;
