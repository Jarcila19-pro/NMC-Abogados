import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  buildPublicSite,
  createProductionConfig,
  PUBLIC_FILES,
  validateConfigProfile,
  validateProductionEndpoint,
  verifyPublicSite,
} from "../scripts/build-public-site.mjs";

const SAFE_CONFIG = await readFile("js/config.js", "utf8");
const TEST_ENDPOINT = "https://script.google.com/macros/s/TEST_DEPLOYMENT_ID/exec";
const WORKFLOW = await readFile(".github/workflows/pages.yml", "utf8");

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
      await assert.rejects(verifyPublicSite(output), /perfil safe requiere/);
    }
  });
});

test("el perfil seguro sigue apagado y los nombres de perfil son explícitos", () => {
  assert.equal(validateConfigProfile(SAFE_CONFIG, "safe"), true);
  assert.throws(() => validateConfigProfile(SAFE_CONFIG, "production"), /URL \/exec/);
  assert.throws(() => validateConfigProfile(SAFE_CONFIG, "staging"), /exactamente "safe" o "production"/);
});

test("el endpoint productivo valida HTTPS, host, ruta y ausencia de parámetros", () => {
  assert.equal(validateProductionEndpoint(TEST_ENDPOINT), TEST_ENDPOINT);

  for (const endpoint of [
    "",
    "http://script.google.com/macros/s/TEST_DEPLOYMENT_ID/exec",
    "https://example.com/macros/s/TEST_DEPLOYMENT_ID/exec",
    "https://script.google.com.evil.example/macros/s/TEST_DEPLOYMENT_ID/exec",
    "https://script.google.com/exec",
    "https://script.google.com/macros/s/TEST_DEPLOYMENT_ID/dev",
    "https://script.google.com/macros/s/TEST_DEPLOYMENT_ID/exec/",
    `${TEST_ENDPOINT}?source=qa`,
    `${TEST_ENDPOINT}#fragment`,
    `${TEST_ENDPOINT}?`,
    `${TEST_ENDPOINT}#`,
    "https://user@script.google.com/macros/s/TEST_DEPLOYMENT_ID/exec",
  ]) {
    assert.throws(() => validateProductionEndpoint(endpoint), undefined, endpoint);
  }
});

test("la configuración productiva válida se genera solo en memoria para la prueba", () => {
  const productionConfig = createProductionConfig(SAFE_CONFIG, TEST_ENDPOINT);
  assert.equal(validateConfigProfile(productionConfig, "production"), true);
  assert.match(productionConfig, /"registryEndpoint": "https:\/\/script\.google\.com\/macros\/s\/TEST_DEPLOYMENT_ID\/exec"/);
  assert.match(productionConfig, /"consentApproved": true/);
  assert.match(productionConfig, /"consentVersion": "NMC-CONSENT-1\.0"/);
  assert.doesNotMatch(
    createProductionConfig(`${SAFE_CONFIG}\nwindow.NMC_CONFIG.localSecret = "must-not-ship";`, TEST_ENDPOINT),
    /must-not-ship/,
  );
});

test("el perfil productivo rechaza cualquier puerta adicional o consentimiento distinto", () => {
  const productionConfig = createProductionConfig(SAFE_CONFIG, TEST_ENDPOINT);
  const invalidConfigs = [
    productionConfig.replace(`"registryEndpoint": "${TEST_ENDPOINT}"`, '"registryEndpoint": ""'),
    productionConfig.replace(`"registryEndpoint": "${TEST_ENDPOINT}"`, '"registryEndpoint": "http://script.google.com/macros/s/TEST_DEPLOYMENT_ID/exec"'),
    productionConfig.replace(`"registryEndpoint": "${TEST_ENDPOINT}"`, '"registryEndpoint": "https://example.com/macros/s/TEST_DEPLOYMENT_ID/exec"'),
    productionConfig.replace(`"registryEndpoint": "${TEST_ENDPOINT}"`, '"registryEndpoint": "https://script.google.com/macros/s/TEST_DEPLOYMENT_ID/other"'),
    productionConfig.replace(`"registryEndpoint": "${TEST_ENDPOINT}"`, `"registryEndpoint": "${TEST_ENDPOINT}?qa=1"`),
    productionConfig.replace('"consentVersion": "NMC-CONSENT-1.0"', '"consentVersion": "NMC-CONSENT-0.9"'),
    productionConfig.replace('"allowLocalRegistry": false', '"allowLocalRegistry": true'),
    productionConfig.replace(/("attribution":\s*\{[\s\S]*?"enabled":\s*)false/, "$1true"),
    productionConfig.replace(/("analytics":\s*\{[\s\S]*?"enabled":\s*)false/, "$1true"),
    productionConfig.replace('"consentGranted": false', '"consentGranted": true'),
    productionConfig.replace('"ga4MeasurementId": ""', '"ga4MeasurementId": "G-ABCD123456"'),
    productionConfig.replace('"adsConversionSendTo": ""', '"adsConversionSendTo": "AW-123/abc"'),
    productionConfig.replace('"debug": false', '"debug": true'),
  ];

  for (const invalidConfig of invalidConfigs) {
    assert.throws(() => validateConfigProfile(invalidConfig, "production"));
  }
});

test("producción sin endpoint no crea artefacto y perfiles arbitrarios fallan", async () => {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "nmc-production-profile-"));
  const output = path.join(temporaryDirectory, "site");
  try {
    await assert.rejects(
      buildPublicSite(output, { profile: "production", registryEndpoint: "" }),
      /URL \/exec/,
    );
    await assert.rejects(readdir(output));
    await assert.rejects(
      buildPublicSite(output, { profile: "prod", registryEndpoint: TEST_ENDPOINT }),
      /exactamente "safe" o "production"/,
    );
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("publicar manualmente safe genera un artefacto con las integraciones apagadas", async () => {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "nmc-safe-profile-"));
  const output = path.join(temporaryDirectory, "site");
  try {
    await buildPublicSite(output, { profile: "safe" });
    const config = await readFile(path.join(output, "js", "config.js"), "utf8");
    assert.equal(validateConfigProfile(config, "safe"), true);
    assert.match(config, /registryEndpoint:\s*""/);
    assert.match(config, /allowLocalRegistry:\s*false/);
    assert.match(config, /consentApproved:\s*false/);
    assert.match(config, /consentVersion:\s*""/);
    assert.deepEqual(await verifyPublicSite(output, "safe"), [...PUBLIC_FILES].sort());
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("PR valida safe y la publicación manual elige safe o production con confirmación", () => {
  assert.match(WORKFLOW, /pull_request:\s+branches:\s+- main/);
  assert.match(
    WORKFLOW,
    /confirm_publication:\s+description: Confirmar publicación del sitio público en main\s+required: true\s+type: boolean\s+default: false/,
  );
  assert.match(
    WORKFLOW,
    /profile:\s+description: Perfil que se compilará y publicará\s+required: true\s+type: choice\s+options:\s+- safe\s+- production\s+default: safe/,
  );
  assert.match(
    WORKFLOW,
    /name: Build and verify safe profile\s+if: >-\s+github\.event_name == 'pull_request' \|\|\s+\(github\.event_name == 'workflow_dispatch' &&\s+github\.ref == 'refs\/heads\/main' &&\s+inputs\.confirm_publication &&\s+inputs\.profile == 'safe'\)\s+run: node scripts\/build-public-site\.mjs --profile safe/,
  );
  assert.match(
    WORKFLOW,
    /name: Build and verify production profile\s+if: >-\s+github\.event_name == 'workflow_dispatch' &&\s+github\.ref == 'refs\/heads\/main' &&\s+inputs\.confirm_publication &&\s+inputs\.profile == 'production'\s+env:\s+# Set this repository variable only after production deployment; use its \/exec URL, never QA\.\s+NMC_REGISTRY_ENDPOINT: \$\{\{ vars\.NMC_PRODUCTION_REGISTRY_ENDPOINT \}\}\s+run: node scripts\/build-public-site\.mjs --profile production/,
  );
  assert.match(WORKFLOW, /Upload public artifact\s+if: github\.event_name != 'pull_request'/);
  assert.match(
    WORKFLOW,
    /deploy:\s+if:\s+>-\s+github\.event_name == 'workflow_dispatch' &&\s+github\.ref == 'refs\/heads\/main' &&\s+inputs\.confirm_publication/,
  );
});
