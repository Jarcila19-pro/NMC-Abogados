// Capturas por sección para revisión visual (Edge headless, sin dependencias).
import { mkdir } from "node:fs/promises";
import { launchBrowser } from "./cdp.mjs";

const BASE = process.env.NMC_URL || "http://127.0.0.1:8123/";
const OUT = "pruebas/salidas/secciones";
const sections = ["hero", "about", "proposito", "services", "academic", "why", "faq", "contact"];

const PREPARE = `(() => {
  const style = document.createElement('style');
  style.textContent = \`
    *, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; }
    .reveal, .reveal-left, .reveal-right, .blog-post { opacity: 1 !important; transform: none !important; }
    .hero-sub, .hero-actions { opacity: 1 !important; transform: none !important; }
    #loader { display: none !important; }
    html { scroll-behavior: auto !important; }
  \`;
  document.head.appendChild(style);
  document.querySelectorAll('img[loading="lazy"]').forEach((img) => { img.loading = 'eager'; });
})()`;

await mkdir(OUT, { recursive: true });
const browser = await launchBrowser();
try {
  for (const [name, width, height] of [
    ["escritorio", 1366, 900],
    ["movil", 390, 844],
  ]) {
    await browser.setViewport(width, height);
    await browser.goto(BASE);
    await browser.evaluate(PREPARE);
    await new Promise((resolve) => setTimeout(resolve, 700));

    if (name === "escritorio") {
      await browser.evaluate(`document.querySelector('#faq details').open = true`);
    }

    for (const id of sections) {
      const found = await browser.evaluate(`(() => {
        const el = document.getElementById('${id}');
        if (!el) return false;
        el.scrollIntoView({ block: 'start' });
        return true;
      })()`);
      if (!found) continue;
      await new Promise((resolve) => setTimeout(resolve, 200));
      await browser.screenshot(`${OUT}/${name}-${id}.png`, { fullPage: false });
    }

    await browser.evaluate("window.scrollTo(0, document.body.scrollHeight)");
    await new Promise((resolve) => setTimeout(resolve, 250));
    await browser.screenshot(`${OUT}/${name}-footer.png`, { fullPage: false });
  }
  console.log(`Capturas en ${OUT}`);
} finally {
  await browser.close();
}
