import { copyFile, lstat, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const PUBLIC_FILES = Object.freeze([
  ".nojekyll",
  "404.html",
  "5aea0e8bff5cc5254c391c8c588c730b.txt",
  "CNAME",
  "index.html",
  "privacidad.html",
  "robots.txt",
  "sitemap.xml",
  "css/privacidad.css",
  "css/styles.css",
  "img/apple-touch-icon.png",
  "img/favicon-32.png",
  "img/favicon-64.png",
  "img/foto-natalia-2.jpeg",
  "img/foto-natalia-2.webp",
  "img/logo-nmc.webp",
  "img/logo_natalia-removebg-preview.png",
  "img/natalia-hero.jpeg",
  "img/natalia-hero.webp",
  "img/natalia-quienes-somos.jpeg",
  "img/natalia-quienes-somos.webp",
  "js/analytics.js",
  "js/config.js",
  "js/form-core.js",
  "js/main.js",
  "js/registry.js",
]);

const SAFE_PROFILE = "safe";
const PRODUCTION_PROFILE = "production";
const REQUIRED_CONSENT_VERSION = "NMC-CONSENT-1.0";
const JSON_STRING_LITERAL = String.raw`"(?:\\.|[^"\\])*"`;

function assertProfile(profile) {
  if (profile !== SAFE_PROFILE && profile !== PRODUCTION_PROFILE) {
    throw new Error('El perfil debe ser exactamente "safe" o "production".');
  }
  return profile;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function exactlyOneMatch(source, expression, name) {
  const matches = [...source.matchAll(expression)];
  if (matches.length !== 1) {
    throw new Error(`La configuración debe definir exactamente una propiedad ${name}.`);
  }
  return matches[0];
}

function propertyNamePattern(name) {
  const escaped = escapeRegExp(name);
  return `(?:"${escaped}"|${escaped})`;
}

function readStringProperty(source, name) {
  const expression = new RegExp(
    `^[\\t ]*${propertyNamePattern(name)}[\\t ]*:[\\t ]*(${JSON_STRING_LITERAL})[\\t ]*,?[\\t ]*$`,
    "gm",
  );
  const match = exactlyOneMatch(source, expression, name);
  try {
    return JSON.parse(match[1]);
  } catch {
    throw new Error(`La propiedad ${name} debe ser una cadena JSON válida.`);
  }
}

function readBooleanProperty(source, name) {
  const expression = new RegExp(
    `^[\\t ]*${propertyNamePattern(name)}[\\t ]*:[\\t ]*(true|false)[\\t ]*,?[\\t ]*$`,
    "gm",
  );
  return exactlyOneMatch(source, expression, name)[1] === "true";
}

function readNumberProperty(source, name) {
  const expression = new RegExp(
    `^[\\t ]*${propertyNamePattern(name)}[\\t ]*:[\\t ]*(\\d+(?:\\.\\d+)?)[\\t ]*,?[\\t ]*$`,
    "gm",
  );
  return Number(exactlyOneMatch(source, expression, name)[1]);
}

function readObjectBody(source, name) {
  const expression = new RegExp(
    `^[\\t ]*${propertyNamePattern(name)}[\\t ]*:[\\t ]*\\{([^}]*)\\}[\\t ]*,?[\\t ]*$`,
    "gm",
  );
  return exactlyOneMatch(source, expression, name)[1];
}

function assertValue(actual, expected, name, profile) {
  if (actual !== expected) {
    throw new Error(
      `El perfil ${profile} requiere ${name}=${JSON.stringify(expected)}.`,
    );
  }
}

export function validateProductionEndpoint(endpoint) {
  if (
    typeof endpoint !== "string" ||
    !endpoint ||
    endpoint !== endpoint.trim() ||
    endpoint.includes("?") ||
    endpoint.includes("#")
  ) {
    throw new Error(
      "El perfil productivo requiere NMC_REGISTRY_ENDPOINT con la URL /exec real, sin query ni fragmento.",
    );
  }

  let url;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error("El endpoint productivo no es una URL válida.");
  }

  if (
    url.href !== endpoint ||
    url.protocol !== "https:" ||
    url.hostname !== "script.google.com" ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname)
  ) {
    throw new Error(
      "El endpoint productivo debe ser HTTPS de script.google.com con la ruta /macros/s/<deployment-id>/exec.",
    );
  }
  return endpoint;
}

export function validateConfigProfile(config, profile = SAFE_PROFILE) {
  assertProfile(profile);
  const registryEndpoint = readStringProperty(config, "registryEndpoint");
  assertValue(
    readBooleanProperty(config, "allowLocalRegistry"),
    false,
    "allowLocalRegistry",
    profile,
  );

  if (profile === SAFE_PROFILE) {
    assertValue(registryEndpoint, "", "registryEndpoint", profile);
    assertValue(
      readBooleanProperty(config, "consentApproved"),
      false,
      "consentApproved",
      profile,
    );
    assertValue(readStringProperty(config, "consentVersion"), "", "consentVersion", profile);
  } else {
    validateProductionEndpoint(registryEndpoint);
    assertValue(
      readBooleanProperty(config, "consentApproved"),
      true,
      "consentApproved",
      profile,
    );
    assertValue(
      readStringProperty(config, "consentVersion"),
      REQUIRED_CONSENT_VERSION,
      "consentVersion",
      profile,
    );
  }

  assertValue(
    readBooleanProperty(readObjectBody(config, "attribution"), "enabled"),
    false,
    "attribution.enabled",
    profile,
  );

  const analytics = readObjectBody(config, "analytics");
  assertValue(readBooleanProperty(analytics, "enabled"), false, "analytics.enabled", profile);
  assertValue(
    readBooleanProperty(analytics, "consentGranted"),
    false,
    "analytics.consentGranted",
    profile,
  );
  assertValue(readStringProperty(analytics, "ga4MeasurementId"), "", "ga4MeasurementId", profile);
  assertValue(readStringProperty(analytics, "adsConversionSendTo"), "", "adsConversionSendTo", profile);
  assertValue(readBooleanProperty(analytics, "debug"), false, "analytics.debug", profile);
  return true;
}

export function createProductionConfig(safeConfig, endpoint) {
  validateConfigProfile(safeConfig, SAFE_PROFILE);
  validateProductionEndpoint(endpoint);

  const attribution = readObjectBody(safeConfig, "attribution");
  const analytics = readObjectBody(safeConfig, "analytics");
  const config = {
    whatsappNumber: readStringProperty(safeConfig, "whatsappNumber"),
    registryEndpoint: endpoint,
    registryTimeoutMs: readNumberProperty(safeConfig, "registryTimeoutMs"),
    allowLocalRegistry: false,
    consentApproved: true,
    consentVersion: REQUIRED_CONSENT_VERSION,
    attribution: {
      enabled: readBooleanProperty(attribution, "enabled"),
    },
    analytics: {
      enabled: readBooleanProperty(analytics, "enabled"),
      consentGranted: readBooleanProperty(analytics, "consentGranted"),
      ga4MeasurementId: readStringProperty(analytics, "ga4MeasurementId"),
      adsConversionSendTo: readStringProperty(analytics, "adsConversionSendTo"),
      debug: readBooleanProperty(analytics, "debug"),
    },
  };
  const generated = `window.NMC_CONFIG = ${JSON.stringify(config, null, 2)};\n`;
  validateConfigProfile(generated, PRODUCTION_PROFILE);
  return generated;
}

function isWithin(parent, target) {
  const relative = path.relative(parent, target);
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}

async function assertRegularFile(filePath) {
  const stats = await lstat(filePath);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error(`El archivo publicable no es un archivo regular: ${filePath}`);
  }
}

async function listFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`El artefacto contiene un enlace simbólico: ${relative}`);
    }
    if (entry.isDirectory()) {
      files.push(...(await listFiles(absolute, relative)));
    } else if (entry.isFile()) {
      files.push(relative);
    } else {
      throw new Error(`El artefacto contiene una entrada no permitida: ${relative}`);
    }
  }
  return files;
}

export async function verifyPublicSite(outputDirectory, profile = SAFE_PROFILE) {
  assertProfile(profile);
  const output = path.resolve(outputDirectory);
  const expected = [...PUBLIC_FILES].sort();
  const actual = (await listFiles(output)).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    const missing = expected.filter((file) => !actual.includes(file));
    const unexpected = actual.filter((file) => !expected.includes(file));
    throw new Error(
      `Artefacto fuera del allowlist. Faltan: ${missing.join(", ") || "ninguno"}. ` +
        `Sobran: ${unexpected.join(", ") || "ninguno"}.`,
    );
  }

  const config = await readFile(path.join(output, "js", "config.js"), "utf8");
  validateConfigProfile(config, profile);
  return actual;
}

export async function buildPublicSite(outputDirectory, options = {}) {
  const profile = assertProfile(
    options.profile === undefined ? SAFE_PROFILE : options.profile,
  );
  const endpoint =
    profile === PRODUCTION_PROFILE
      ? validateProductionEndpoint(
          options.registryEndpoint === undefined
            ? process.env.NMC_REGISTRY_ENDPOINT
            : options.registryEndpoint,
        )
      : "";
  const output = path.resolve(outputDirectory);
  if (isWithin(ROOT, output) || isWithin(output, ROOT)) {
    throw new Error("El artefacto debe generarse fuera del repositorio.");
  }

  try {
    await lstat(output);
    throw new Error(`La ruta de salida ya existe; no se sobrescribirá: ${output}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  await mkdir(output, { recursive: false });
  try {
    for (const relative of PUBLIC_FILES) {
      const source = path.join(ROOT, ...relative.split("/"));
      await assertRegularFile(source);
      const destination = path.join(output, ...relative.split("/"));
      await mkdir(path.dirname(destination), { recursive: true });
      if (profile === PRODUCTION_PROFILE && relative === "js/config.js") {
        const safeConfig = await readFile(source, "utf8");
        await writeFile(destination, createProductionConfig(safeConfig, endpoint), {
          flag: "wx",
        });
      } else {
        await copyFile(source, destination);
      }
    }
    return await verifyPublicSite(output, profile);
  } catch (error) {
    await rm(output, { recursive: true, force: true });
    throw error;
  }
}

function parseCliOptions(args) {
  const options = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];
    if (name !== "--out" && name !== "--profile") {
      throw new Error(`Opción no permitida: ${name}`);
    }
    if (options.has(name) || !args[index + 1] || args[index + 1].startsWith("--")) {
      throw new Error(`La opción ${name} requiere un solo valor.`);
    }
    options.set(name, args[index + 1]);
    index += 1;
  }
  return options;
}

async function runCli() {
  const options = parseCliOptions(process.argv.slice(2));
  const output = options.get("--out");
  const profile = options.get("--profile") || SAFE_PROFILE;
  assertProfile(profile);
  if (!output) {
    throw new Error(
      "Uso: node scripts/build-public-site.mjs --out <directorio-nuevo-fuera-del-repo> [--profile safe|production]",
    );
  }
  const files = await buildPublicSite(output, { profile });
  console.log(`Artefacto verificado (${profile}): ${files.length} archivos publicables.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
