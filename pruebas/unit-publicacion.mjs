import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  buildPublicSite,
  PUBLIC_FILES,
  verifyPublicSite,
} from "../scripts/build-public-site.mjs";

async function withPublicSite(callback) {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "nmc-public-site-"));
  const output = path.join(temporaryDirectory, "site");
  try {
    await buildPublicSite(output);
    return await callback(output);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function listFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await listFiles(path.join(directory, entry.name), relative)));
    } else {
      files.push(relative);
    }
  }
  return files.sort();
}

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function localTarget(page, value) {
  const url = decodeHtml(value.trim());
  if (!url || url.startsWith("//") || /^[a-z][a-z\d+.-]*:/i.test(url)) {
    return null;
  }
  if (url.startsWith("#")) return { page, fragment: url.slice(1) };
  const pathname = url.split(/[?#]/, 1)[0];
  if (!pathname) return { page, fragment: url.slice(1) };
  const relative = pathname === "/"
    ? "index.html"
    : pathname.startsWith("/")
      ? pathname.slice(1)
      : path.posix.join(path.posix.dirname(page), pathname);
  return { page: path.posix.normalize(relative), fragment: url.split("#")[1] || "" };
}

async function assertLocalHtmlReferences(output) {
  const pages = ["index.html", "privacidad.html", "404.html"];
  const contents = new Map(
    await Promise.all(
      pages.map(async (page) => [page, await readFile(path.join(output, page), "utf8")]),
    ),
  );
  const ids = new Map(
    pages.map((page) => [
      page,
      new Set([...contents.get(page).matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1])),
    ]),
  );

  for (const [page, html] of contents) {
    // El contenido de los scripts inline no son referencias del navegador:
    // ahí viven cadenas como la carga opcional de config-qa.local.js en local.
    const markup = html.replace(
      /<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi,
      "<script></script>",
    );
    const tags = markup.match(/<(?:a|link|script|img|source)\b[^>]*>/gi) || [];
    for (const tag of tags) {
      const attrs = [...tag.matchAll(/\b(href|src|srcset)=["']([^"']*)["']/gi)];
      for (const [, attribute, rawValue] of attrs) {
        const values =
          attribute.toLowerCase() === "srcset"
            ? rawValue.split(",").map((candidate) => candidate.trim().split(/\s+/, 1)[0])
            : [rawValue];
        for (const value of values) {
          const target = localTarget(page, value);
          if (!target) continue;
          assert.ok(PUBLIC_FILES.includes(target.page), `${page} referencia archivo no permitido: ${target.page}`);
          const targetPath = path.join(output, ...target.page.split("/"));
          await readFile(targetPath);
          if (target.fragment) {
            const targetHtml = contents.get(target.page);
            assert.ok(
              targetHtml && ids.get(target.page).has(decodeURIComponent(target.fragment)),
              `${page} referencia un fragmento inexistente: ${value}`,
            );
          }
        }
      }

      if (tag.toLowerCase().startsWith("<img")) {
        assert.match(tag, /\balt=["'][^"']*["']/i, `${page} contiene una imagen sin alt`);
      }
    }
  }
}

test("el artefacto contiene exactamente la lista pública y excluye material interno", async () => {
  await withPublicSite(async (output) => {
    assert.deepEqual(await listFiles(output), [...PUBLIC_FILES].sort());
    for (const excluded of ["README.md", "skills-lock.json", "pruebas", "integracion", ".github", "scripts"]) {
      await assert.rejects(readFile(path.join(output, excluded)));
    }
  });
});

test("verifica referencias internas, metadatos esenciales y alt de imágenes", async () => {
  await withPublicSite(async (output) => {
    await assertLocalHtmlReferences(output);
    for (const page of ["index.html", "privacidad.html", "404.html"]) {
      const html = await readFile(path.join(output, page), "utf8");
      assert.match(html, /<title>[^<]+<\/title>/i, `${page} sin title`);
      assert.match(html, /<meta\s+name="description"\s+content="[^"]+"/i, `${page} sin description`);
      assert.equal((html.match(/<h1\b/gi) || []).length, 1, `${page} debe tener un H1`);
    }
    const home = await readFile(path.join(output, "index.html"), "utf8");
    const privacy = await readFile(path.join(output, "privacidad.html"), "utf8");
    assert.match(home, /<link rel="canonical" href="https:\/\/nmcabogada\.com\/"/i);
    assert.match(privacy, /<link rel="canonical" href="https:\/\/nmcabogada\.com\/privacidad\.html"/i);
    assert.match(
      await readFile(path.join(output, "404.html"), "utf8"),
      /<meta name="robots" content="noindex, follow"/i,
    );
  });
});

test("el verificador rechaza artefactos con archivos no permitidos", async () => {
  await withPublicSite(async (output) => {
    await writeFile(path.join(output, "internal.md"), "no publicar");
    await assert.rejects(verifyPublicSite(output), /Artefacto fuera del allowlist/);
  });
});

test("el verificador impide publicar si se activa alguna compuerta externa", async () => {
  await withPublicSite(async (output) => {
    const configPath = path.join(output, "js", "config.js");
    const config = await readFile(configPath, "utf8");
    const enabledConfigs = [
      config.replace('registryEndpoint: ""', 'registryEndpoint: "https://example.test/exec"'),
      config.replace('allowLocalRegistry: false', 'allowLocalRegistry: true'),
      config.replace('consentApproved: false', 'consentApproved: true'),
      config.replace('consentVersion: ""', 'consentVersion: "aprobada-v1"'),
      config.replace(/(attribution:\s*\{[\s\S]*?enabled:\s*)false/, "$1true"),
      config.replace(/(analytics:\s*\{[\s\S]*?enabled:\s*)false/, "$1true"),
      config.replace('consentGranted: false', 'consentGranted: true'),
      config.replace('ga4MeasurementId: ""', 'ga4MeasurementId: "G-ABCD123456"'),
      config.replace('adsConversionSendTo: ""', 'adsConversionSendTo: "AW-123/abc"'),
      config.replace('debug: false', 'debug: true'),
    ];

    for (const enabledConfig of enabledConfigs) {
      await writeFile(configPath, enabledConfig);
      await assert.rejects(verifyPublicSite(output), /compuertas externas/);
    }
  });
});
