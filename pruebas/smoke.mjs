// Prueba local sin dependencias: renderiza el sitio en Edge headless y verifica
// estructura, recursos, widget, FAQ y desbordes horizontales.
import { mkdir, writeFile } from "node:fs/promises";
import { launchBrowser } from "./cdp.mjs";

const BASE = process.env.NMC_URL || "http://127.0.0.1:8123/";
const OUT = "pruebas/salidas";
const results = [];
const consoleErrors = [];
const failedRequests = [];

const REVEAL_ALL = `(() => {
  const style = document.createElement('style');
  style.id = 'qa-reveal-all';
  style.textContent = \`
    *, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; }
    .reveal, .reveal-left, .reveal-right, .blog-post { opacity: 1 !important; transform: none !important; }
    .hero-sub, .hero-actions { opacity: 1 !important; transform: none !important; }
    #loader { display: none !important; }
  \`;
  document.head.appendChild(style);
  document.querySelectorAll('img[loading="lazy"]').forEach((img) => { img.loading = 'eager'; });
})()`;

const settle = () => new Promise((resolve) => setTimeout(resolve, 600));

function check(name, condition, detail = "") {
  results.push({ name, ok: Boolean(condition), detail });
}

await mkdir(OUT, { recursive: true });
const browser = await launchBrowser();
const { page } = browser;

page.on("Runtime.exceptionThrown", (message) => {
  consoleErrors.push(
    message.params.exceptionDetails.exception?.description ||
      message.params.exceptionDetails.text,
  );
});
page.on("Log.entryAdded", (message) => {
  if (message.params.entry.level === "error") {
    consoleErrors.push(message.params.entry.text);
  }
});
page.on("Network.responseReceived", (message) => {
  const { status, url } = message.params.response;
  if (status >= 400) failedRequests.push(`${status} ${url}`);
});

try {
  await browser.setViewport(1366, 900);
  await browser.goto(BASE);

  check("Título de la página", (await browser.evaluate("document.title")).includes("Natalia Márquez"));
  check("Una sola etiqueta H1", (await browser.evaluate("document.querySelectorAll('h1').length")) === 1);
  check("Sección FAQ visible", (await browser.evaluate("!!document.querySelector('#faq')")));
  check("Cuatro preguntas frecuentes", (await browser.evaluate("document.querySelectorAll('#faq details').length")) === 4);

  const schema = await browser.evaluate(`(() => {
    const blocks = [...document.querySelectorAll('script[type="application/ld+json"]')]
      .map((s) => JSON.parse(s.textContent));
    const faq = blocks.find((b) => b["@type"] === "FAQPage");
    return faq ? faq.mainEntity.map((q) => q.name) : [];
  })()`);
  const summaries = await browser.evaluate(
    "[...document.querySelectorAll('#faq summary')].map((s) => s.textContent.trim())",
  );
  check("JSON-LD FAQ coincide con la FAQ visible", JSON.stringify(schema) === JSON.stringify(summaries), `${schema.length} vs ${summaries.length}`);

  check("JSON-LD principal parseable", (await browser.evaluate(`(() => {
    const b = JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent);
    return b["@graph"].some((n) => n["@type"] === "Attorney");
  })()`)));

  check("CTA de navegación apunta al formulario", (await browser.evaluate("document.querySelector('.nav-cta').getAttribute('href')")) === "#cf-whatsapp-form");
  check("El destino del CTA existe", (await browser.evaluate("!!document.querySelector('#cf-whatsapp-form')")));
  check("El enlace de salto apunta a main", (await browser.evaluate("document.querySelector('.skip-link').getAttribute('href')")) === "#contenido");
  check("El logo carga desde WebP", (await browser.evaluate("document.querySelector('.nav-logo img').currentSrc")).endsWith(".webp"));
  check("La imagen principal carga", (await browser.evaluate("document.querySelector('.hero-right img').naturalWidth")) > 0);
  check("Favicon dedicado declarado", (await browser.evaluate("!!document.querySelector('link[rel=\"icon\"][sizes=\"32x32\"]')")));

  const widget = await browser.evaluate(`(() => {
    const w = document.querySelector('#whatsapp-widget');
    const t = w.querySelector('.whatsapp-widget-toggle');
    t.click();
    const open = w.classList.contains('is-open') && t.getAttribute('aria-expanded') === 'true';
    const link = w.querySelector('.whatsapp-panel-link').href;
    t.click();
    return { open, closed: t.getAttribute('aria-expanded') === 'false', link };
  })()`);
  check("Widget abre y cierra", widget.open && widget.closed);
  check("Widget enlaza a WhatsApp", widget.link.startsWith("https://wa.me/573146153979"));
  check("Widget no se solapa con el menú móvil", (await browser.evaluate("getComputedStyle(document.querySelector('#whatsapp-widget')).zIndex")) !== "auto");

  const form = await browser.evaluate(`(() => {
    const f = document.querySelector('#cf-whatsapp-form');
    return {
      fields: f.querySelectorAll('input,textarea').length,
      maxlengths: [...f.querySelectorAll('input,textarea')].every((el) => el.maxLength > 0),
      button: f.querySelector('.cf-btn').textContent.trim(),
      status: !!f.querySelector('#cf-form-status')
    };
  })()`);
  check("Formulario con cuatro campos y límites", form.fields === 4 && form.maxlengths);
  check("Mensaje del botón es honesto", form.button === "Continuar en WhatsApp");
  check("Estado accesible del formulario", form.status);

  await browser.evaluate(REVEAL_ALL);
  await settle();
  await browser.screenshot(`${OUT}/escritorio.png`);
  check("Sin desborde horizontal en escritorio", (await browser.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1")));

  await browser.setViewport(768, 1024);
  await browser.goto(BASE);
  await browser.evaluate(REVEAL_ALL);
  await settle();
  await browser.screenshot(`${OUT}/tablet.png`);
  check("Sin desborde horizontal en tablet", (await browser.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1")));

  await browser.setViewport(390, 844);
  await browser.goto(BASE);
  await browser.evaluate(REVEAL_ALL);
  await settle();
  await browser.screenshot(`${OUT}/movil.png`);
  check("Sin desborde horizontal en móvil", (await browser.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1")));
  check("Menú móvil presente", (await browser.evaluate("!!document.querySelector('.hamburger')")));

  check("Sin excepciones de JavaScript", consoleErrors.length === 0, consoleErrors.join(" | "));
  check("Sin recursos 404", failedRequests.length === 0, failedRequests.join(" | "));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
await writeFile(
  `${OUT}/resultados.json`,
  JSON.stringify({ fecha: new Date().toISOString(), results }, null, 2),
);

for (const result of results) {
  console.log(`${result.ok ? "OK  " : "FALLA"} ${result.name}${result.detail ? ` — ${result.detail}` : ""}`);
}
console.log(`\n${results.length - failed.length}/${results.length} comprobaciones correctas`);
process.exit(failed.length ? 1 : 0);
