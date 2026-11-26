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
const REDIRECT_PORT = 8125;
const REDIRECT = `http://127.0.0.1:${REDIRECT_PORT}`;
const receivedPayloads = [];
const retryPayloads = [];
const redirectedRecords = new Map();
const retryRecords = new Map();
let areaSubmissionCount = 0;
let retryCount = 0;
let postRequests = 0;

function check(name, condition, detail = "") {
  results.push({ name, ok: Boolean(condition), detail });
}

const redirectServer = createServer((_req, res) => {
  const allowed = new URL(_req.url, REDIRECT).pathname === "/allow";
  res.writeHead(200, {
    "Content-Type": "application/json;charset=utf-8",
    ...(allowed ? { "Access-Control-Allow-Origin": "*" } : {}),
  });
  res.end(JSON.stringify({
    ok: true,
    id: "NMC-00000000000000000000000000000007",
  }));
});
await new Promise((resolve) => redirectServer.listen(REDIRECT_PORT, "127.0.0.1", resolve));

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
  if (req.url === "/areas") {
    areaSubmissionCount += 1;
    return json(200, {
      ok: true,
      id: `NMC-${String(areaSubmissionCount).padStart(32, "0")}`,
    });
  }
  if (req.url === "/redirect-ok") {
    res.writeHead(302, {
      Location: `${REDIRECT}/allow`,
      "Access-Control-Allow-Origin": "*",
    });
    res.end();
    return;
  }
  if (req.url === "/redirect-commit") {
    const key = payload && payload.claveIdempotencia;
    if (redirectedRecords.has(key)) {
      return json(200, {
        ok: true,
        id: redirectedRecords.get(key),
        duplicado: true,
      });
    }
    redirectedRecords.set(key, "NMC-00000000000000000000000000000008");
    res.writeHead(302, {
      Location: `${REDIRECT}/deny`,
      "Access-Control-Allow-Origin": "*",
    });
    res.end();
    return;
  }
  if (req.url === "/duplicate") return json(200, { ok: true, id: "NMC-00000000000000000000000000000002", duplicado: true });
  if (req.url === "/reject") return json(200, { ok: false, code: "VALIDATION", message: "Datos incompletos" });
  if (req.url === "/error") return json(500, { ok: false });
  if (req.url === "/badid") return json(200, { ok: true, id: "NOT-A-VALID-ID" });
  if (req.url === "/retry") {
    retryPayloads.push(payload);
    retryCount += 1;
    if (retryCount === 1) {
      retryRecords.set(payload.claveIdempotencia, "NMC-00000000000000000000000000000003");
      return json(200, { ok: false, code: "SERVER_ERROR" });
    }
    return json(200, {
      ok: true,
      id: retryRecords.get(payload.claveIdempotencia),
      duplicado: true,
    });
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
    String(entry.url || "").includes(REDIRECT) ||
    String(entry.text || "").includes(`${REDIRECT}/deny`) ||
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
    window.__warnings = [];
    console.warn = (...args) => window.__warnings.push(args.map(String).join(" "));
    window.open = () => {
      window.__openedCount++;
      return null;
    };
    Object.assign(window.NMC_CONFIG, { consentApproved: true, allowLocalRegistry: true }, ${JSON.stringify(pageConfig)});
  })()`);
}

async function fill(values = {}) {
  const data = {
    nombre: "QA Ficticia",
    telefono: "2025550100",
    email: "qa@example.test",
    servicio: "Civil",
    ...values,
  };
  await browser.evaluate(`(() => {
    const values = ${JSON.stringify(data)};
    for (const [id, value] of Object.entries(values)) {
      const field = document.querySelector("#cf-" + id);
      field.value = value;
      field.dispatchEvent(new Event(field.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
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
    f.querySelector("#cf-servicio").value = "Familia";
    f.querySelector(".cf-btn").click();
  })()`);
  const nativeBlocked = await browser.evaluate(`(() => {
    const c = document.querySelector("#cf-consent");
    return { valid: c.checkValidity(), missing: c.validity.valueMissing, status: document.querySelector("#cf-form-status").textContent.trim() };
  })()`);
  check("Sin consentimiento el envío se bloquea", !nativeBlocked.valid && nativeBlocked.missing && nativeBlocked.status === "");
  check("El consentimiento está marcado como obligatorio", await browser.evaluate(`document.querySelector("#cf-consent").required`));
  const serviceOptions = await browser.evaluate(`Array.from(
    document.querySelectorAll("#cf-servicio option"),
    (option) => [option.textContent.trim(), option.value],
  )`);
  check("El selector presenta las cinco áreas con sus valores del contrato", JSON.stringify(serviceOptions) === JSON.stringify([
    ["Selecciona un área de consulta", ""],
    ["Familia", "Familia"],
    ["Civil", "Civil"],
    ["Comercial", "Comercial"],
    ["Laboral y Seguridad Social", "Laboral"],
    ["Otra consulta", "No especificado"],
  ]));

  // 2. El perfil safe no ofrece WhatsApp sin una confirmación del registro.
  await prepare({
    consentApproved: false,
    consentVersion: "",
    registryEndpoint: "",
    allowLocalRegistry: false,
  });
  await fill();
  const requestsBeforeGate = postRequests;
  await browser.evaluate(`document.querySelector(".cf-btn").click()`);
  const gate = await waitForStatus("El registro no está disponible");
  const safeContact = await browser.evaluate(`(() => ({
    linkPresent: !!document.querySelector("#cf-form-status a"),
    openedCount: window.__openedCount,
  }))()`);
  check("El perfil safe informa que el registro no está disponible", gate.includes("El registro no está disponible"));
  check("El perfil safe no ofrece WhatsApp sin confirmación", !safeContact.linkPresent && safeContact.openedCount === 0);
  check("Sin texto aprobado no hay peticiones de registro", postRequests === requestsBeforeGate);

  await prepare({
    consentApproved: false,
    consentVersion: "prueba-v1",
    registryEndpoint: `${MOCK}/ok`,
  });
  await fill();
  const requestsBeforeApproval = postRequests;
  await browser.evaluate(`document.querySelector(".cf-btn").click()`);
  const approvalGate = await waitForStatus("El registro no está disponible");
  check("Una versión configurada no basta sin aprobación explícita", approvalGate.includes("No se envió ningún dato.") && postRequests === requestsBeforeApproval);
  check("La aprobación pendiente no abre WhatsApp", (await browser.evaluate("window.__openedCount")) === 0);

  // 3. Registro exitoso: enlace manual a WhatsApp tras confirmación válida.
  await prepare({ consentVersion: "prueba-v1", registryEndpoint: `${MOCK}/ok`, registryTimeoutMs: 2000 });
  await fill();
  await browser.evaluate(`document.querySelector(".cf-btn").click()`);
  const success = await waitForStatus("Solicitud registrada");
  const successLink = await browser.evaluate(`(() => {
    const link = document.querySelector("#cf-form-status a");
    return link ? { href: link.href, label: link.textContent, target: link.target } : null;
  })()`);
  check("El registro exitoso informa el identificador", success.includes("NMC-00000000000000000000000000000001"), success);
  check("WhatsApp está disponible como enlace manual tras confirmar", !!successLink && successLink.href.startsWith("https://wa.me/573146153979?") && successLink.label === "Continuar por WhatsApp" && successLink.target === "_blank");
  check("No se abre ninguna pestaña durante ni después del envío", (await browser.evaluate("window.__openedCount")) === 0);
  const whatsappText = successLink ? new URL(successLink.href).searchParams.get("text") : "";
  check("WhatsApp prellena solo el saludo genérico", whatsappText === "Hola, quisiera solicitar información.");
  check("WhatsApp no prellena datos personales ni el relato", !/QA Ficticia|2025550100|qa@example\.test|RELATO LEGAL PRIVADO|NMC-00000000000000000000000000000001/.test(successLink.href));
  check("El registro confirmado emite una sola consulta registrada", await eventCount("consulta_registrada") === 1);
  check("El botón vuelve a estar disponible", (await browser.evaluate(`!document.querySelector(".cf-btn").disabled`)));
  const submittedPayload = receivedPayloads.find((entry) => entry.url === "/ok")?.payload;
  check("No hay textarea libre y el payload contiene el área sin mensaje", !!submittedPayload && !Object.hasOwn(submittedPayload, "mensaje") && submittedPayload.servicio === "Civil" && submittedPayload.website === "" && submittedPayload.consentimiento === true && !(await browser.evaluate("!!document.querySelector('#cf-mensaje')")));

  // 4. Las cinco áreas viajan como valores compatibles con el backend.
  for (const servicio of ["Familia", "Civil", "Comercial", "Laboral", "No especificado"]) {
    await prepare({ consentVersion: "prueba-v1", registryEndpoint: `${MOCK}/areas` });
    await fill({ servicio });
    await browser.evaluate(`document.querySelector(".cf-btn").click()`);
    const areaStatus = await waitForStatus("Solicitud registrada");
    const areaPayloads = receivedPayloads.filter((entry) => entry.url === "/areas");
    const areaPayload = areaPayloads[areaPayloads.length - 1]?.payload;
    check(`El área ${servicio} se envía en servicio`, areaStatus.includes("Solicitud registrada") && areaPayload?.servicio === servicio);
  }

  // 5. El doble clic concurrente produce un solo POST y nunca abre pestañas.
  await prepare({ consentVersion: "prueba-v1", registryEndpoint: `${MOCK}/wait`, registryTimeoutMs: 2000 });
  await fill();
  const requestsBeforeDoubleClick = postRequests;
  await browser.evaluate(`(() => {
    const button = document.querySelector(".cf-btn");
    button.click();
    button.click();
  })()`);
  await sleep(100);
  check("El estado de envío se anuncia mientras la petición está pendiente", (await statusText()).includes("Enviando tu solicitud"));
  check("No se abre una pestaña durante el envío", (await browser.evaluate("window.__openedCount")) === 0);
  const doubleClickSuccess = await waitForStatus("Solicitud registrada");
  const waitPayloads = () => receivedPayloads.filter((entry) => entry.url === "/wait");
  check("El doble clic concurrente produce un solo POST", postRequests === requestsBeforeDoubleClick + 1);
  check("El doble clic se confirma con enlace manual y sin abrir pestañas", doubleClickSuccess.includes("Solicitud registrada") && (await browser.evaluate("window.__openedCount")) === 0 && !!(await browser.evaluate("!!document.querySelector('#cf-form-status a')")));
  check("El doble clic envía una sola solicitud", waitPayloads().length === 1);

  // 6. Un rechazo explícito se distingue de un resultado indeterminado.
  await prepare({ consentVersion: "prueba-v1", registryEndpoint: `${MOCK}/reject`, registryTimeoutMs: 2000 });
  await fill();
  await browser.evaluate(`document.querySelector(".cf-btn").click()`);
  const rejected = await waitForStatus("El registro no aceptó");
  check("Un rechazo explícito no se presenta como resultado incierto", rejected.includes("El registro no aceptó") && !(await browser.evaluate("!!document.querySelector('#cf-form-status a')")));
  check("Un rechazo no emite consulta registrada", await eventCount("consulta_registrada") === 0);

  // 7. HTTP no exitoso se trata como resultado indeterminado.
  await prepare({ consentVersion: "prueba-v1", registryEndpoint: `${MOCK}/error`, registryTimeoutMs: 2000 });
  await fill();
  await browser.evaluate(`document.querySelector(".cf-btn").click()`);
  const httpError = await waitForStatus("No pudimos confirmar el resultado");
  check("El error HTTP no afirma que la consulta no se registró", httpError.includes("No pudimos confirmar") && !(await browser.evaluate("!!document.querySelector('#cf-form-status a')")));
  check("El error HTTP no emite consulta registrada", await eventCount("consulta_registrada") === 0);

  // 8. Respuesta no JSON e ID inválido no confirman ni ofrecen WhatsApp.
  await prepare({ consentVersion: "prueba-v1", registryEndpoint: `${MOCK}/garbage`, registryTimeoutMs: 2000 });
  await fill();
  await browser.evaluate(`document.querySelector(".cf-btn").click()`);
  const garbage = await waitForStatus("No pudimos confirmar el resultado");
  check("Una respuesta no JSON queda indeterminada", garbage.includes("No pudimos confirmar") && !(await browser.evaluate("!!document.querySelector('#cf-form-status a')")));
  check("Una respuesta ilegible no emite consulta registrada", await eventCount("consulta_registrada") === 0);

  await prepare({ consentVersion: "prueba-v1", registryEndpoint: `${MOCK}/badid` });
  await fill();
  await browser.evaluate(`document.querySelector(".cf-btn").click()`);
  const badId = await waitForStatus("No pudimos confirmar el resultado");
  check("Un ID inválido no confirma el registro", badId.includes("No pudimos confirmar") && !(await browser.evaluate("!!document.querySelector('#cf-form-status a')")));

  // 9. Un timeout no afirma que la escritura haya fallado.
  await prepare({ consentVersion: "prueba-v1", registryEndpoint: `${MOCK}/slow`, registryTimeoutMs: 600 });
  await fill();
  await browser.evaluate(`document.querySelector(".cf-btn").click()`);
  const timeout = await waitForStatus("No pudimos confirmar el resultado", 8000);
  const timeoutWarnings = await browser.evaluate("window.__warnings.join(' | ')");
  check("El timeout se informa como resultado incierto", timeout.includes("No pudimos confirmar") && timeoutWarnings.includes("TIMEOUT"), `${timeout} | ${timeoutWarnings}`);
  check("El timeout conserva los datos", (await browser.evaluate(`document.querySelector("#cf-nombre").value`)) === "QA Ficticia");
  check("El timeout no emite consulta registrada", await eventCount("consulta_registrada") === 0);

  // 10. Se sigue el redirect y se valida el JSON final legible.
  await prepare({ consentVersion: "prueba-v1", registryEndpoint: `${MOCK}/redirect-ok`, registryTimeoutMs: 2000 });
  await fill();
  await browser.evaluate(`document.querySelector(".cf-btn").click()`);
  const redirectedSuccess = await waitForStatus("Solicitud registrada");
  check("El redirect con CORS legible permite validar el JSON final", redirectedSuccess.includes("NMC-00000000000000000000000000000007") && !!(await browser.evaluate("!!document.querySelector('#cf-form-status a')")));
  check("La respuesta redirigida no abre una pestaña automáticamente", (await browser.evaluate("window.__openedCount")) === 0);

  // 11. Un redirect ilegible después del commit se resuelve con la misma clave.
  await prepare({ consentVersion: "prueba-v1", registryEndpoint: `${MOCK}/redirect-commit`, registryTimeoutMs: 2000 });
  await fill();
  const beforeRedirectCommit = postRequests;
  await browser.evaluate(`document.querySelector(".cf-btn").click()`);
  const uncertainRedirect = await waitForStatus("No pudimos confirmar el resultado");
  const pendingStorage = await browser.evaluate("sessionStorage.getItem('nmc_idem')");
  check("El redirect sin CORS queda indeterminado y no ofrece WhatsApp", uncertainRedirect.includes("No pudimos confirmar") && !(await browser.evaluate("!!document.querySelector('#cf-form-status a')")) && (await browser.evaluate("window.__openedCount")) === 0);
  check("El navegador bloquea la lectura del redirect sin CORS", failedRequests.some((request) => request.includes(`${REDIRECT}/deny`) && request.includes("ERR_FAILED")));
  check("La huella y clave guardadas no contienen datos del contacto", !!pendingStorage && !/QA Ficticia|2025550100|qa@example\\.test/.test(pendingStorage) && JSON.parse(pendingStorage).sig.startsWith("sha256-"));

  await fill({ email: "otra@example.test" });
  await browser.evaluate(`document.querySelector(".cf-btn").click()`);
  const changedPending = await waitForStatus("Hay una solicitud pendiente");
  check("Cambiar datos durante un resultado incierto no genera otro POST", changedPending.includes("Hay una solicitud pendiente") && postRequests === beforeRedirectCommit + 1);

  await fill();
  await browser.evaluate(`document.querySelector(".cf-btn").click()`);
  const retryRedirect = await waitForStatus("Solicitud registrada");
  const redirectRequests = receivedPayloads.filter((entry) => entry.url === "/redirect-commit");
  check("El reintento idéntico reutiliza clave y confirma el registro existente", retryRedirect.includes("NMC-00000000000000000000000000000008") && redirectRequests.length === 2 && redirectRequests[0].payload.claveIdempotencia === redirectRequests[1].payload.claveIdempotencia && redirectedRecords.size === 1);
  check("WhatsApp aparece tras el ID válido y no se abre automáticamente", !!(await browser.evaluate("!!document.querySelector('#cf-form-status a')")) && (await browser.evaluate("window.__openedCount")) === 0);

  // 12. Honeypot: se descarta sin llamar al registro.
  await prepare({ consentVersion: "prueba-v1", registryEndpoint: `${MOCK}/ok`, registryTimeoutMs: 2000 });
  await fill();
  await browser.evaluate(`document.querySelector("#cf-website").value = "spam"`);
  await browser.evaluate(`document.querySelector(".cf-btn").click()`);
  const honeypot = await waitForStatus("No se pudo procesar");
  check("El honeypot descarta el envío", honeypot.includes("No se pudo procesar"));
  check("El honeypot no abre WhatsApp", (await browser.evaluate("window.__openedCount")) === 0);
  check("El honeypot no emite consulta registrada", await eventCount("consulta_registrada") === 0);

  // 13. El payload y WhatsApp no contienen relato ni datos personales.
  await prepare({ consentVersion: "prueba-v1", registryEndpoint: `${MOCK}/duplicate`, registryTimeoutMs: 2000 });
  await fill({
    nombre: "José Núñez-Peña",
    servicio: "Familia",
  });
  await browser.evaluate(`document.querySelector(".cf-btn").click()`);
  const special = await waitForStatus("Solicitud registrada");
  const specialLink = await browser.evaluate(`(() => {
    const link = document.querySelector("#cf-form-status a");
    return link ? link.href : "";
  })()`);
  const specialPayload = receivedPayloads.filter((entry) => entry.url === "/duplicate").slice(-1)[0]?.payload;
  check("El área seleccionada se incluye en el registro", special.includes("NMC-00000000000000000000000000000002") && specialPayload?.servicio === "Familia");
  check("El saludo de WhatsApp es genérico y no incluye datos personales", new URL(specialLink).searchParams.get("text") === "Hola, quisiera solicitar información." && !/José Núñez-Peña|2025550100|qa@example\\.test/.test(specialLink));
  check("El payload no contiene un campo de mensaje libre", !!specialPayload && !Object.hasOwn(specialPayload, "mensaje"));

  // 14. Un error después de guardar reutiliza la misma clave para resolver el resultado.
  await prepare({ consentVersion: "prueba-v1", registryEndpoint: `${MOCK}/retry`, registryTimeoutMs: 2000 });
  await fill();
  await browser.evaluate(`document.querySelector(".cf-btn").click()`);
  const retryFailure = await waitForStatus("No pudimos confirmar el resultado");
  const firstRetryKey = retryPayloads[0]?.claveIdempotencia;
  const retryStorage = await browser.evaluate("sessionStorage.getItem('nmc_idem')");
  await browser.evaluate(`document.querySelector(".cf-btn").click()`);
  const retrySuccess = await waitForStatus("Solicitud registrada");
  check("El reintento reutiliza la misma clave tras SERVER_ERROR", retryFailure.includes("No pudimos confirmar") && !!firstRetryKey && retryPayloads.length === 2 && retryPayloads[1].claveIdempotencia === firstRetryKey && retryRecords.size === 1);
  check("La huella guardada no contiene datos en claro ni relato", !!retryStorage && !/QA Ficticia|2025550100|qa@example\\.test|RELATO LEGAL PRIVADO/.test(retryStorage) && JSON.parse(retryStorage).sig.startsWith("sha256-"));
  check("WhatsApp se ofrece solo después de resolver el registro", retrySuccess.includes("NMC-00000000000000000000000000000003") && !!(await browser.evaluate("!!document.querySelector('#cf-form-status a')")) && (await browser.evaluate("window.__openedCount")) === 0);

  // 15. Navegación por teclado: el selector y el estado siguen accesibles.
  await prepare({ consentVersion: "prueba-v1", registryEndpoint: `${MOCK}/ok`, registryTimeoutMs: 2000 });
  await fill();
  await browser.evaluate(`document.querySelector("#cf-servicio").focus()`);
  const focused = await browser.evaluate("document.activeElement.id");
  check("El selector de área es accesible por teclado", focused === "cf-servicio");
  await browser.evaluate(`document.querySelector(".cf-btn").click()`);
  await waitForStatus("Solicitud registrada");
  const statusFocused = await browser.evaluate("document.activeElement.id");
  check("El estado del formulario recibe el foco", statusFocused === "cf-form-status");

  check("Sin excepciones de JavaScript en el flujo", consoleErrors.length === 0, `${consoleErrors.join(" | ")}${failedRequests.length ? ` | fallos de red: ${failedRequests.join(" | ")}` : ""}`);
} finally {
  await browser.close();
  server.close();
  redirectServer.close();
}

const failed = results.filter((r) => !r.ok);
await writeFile(`${OUT}/resultados-formulario.json`, JSON.stringify({ fecha: new Date().toISOString(), results }, null, 2));
for (const r of results) console.log(`${r.ok ? "OK  " : "FALLA"} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
console.log(`\n${results.length - failed.length}/${results.length} comprobaciones correctas`);
process.exitCode = failed.length ? 1 : 0;
