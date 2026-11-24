import { copyFile, lstat, mkdir, readdir, readFile, rm } from "node:fs/promises";
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

const REQUIRED_DISABLED_GATES = [
  /registryEndpoint:\s*""/,
  /allowLocalRegistry:\s*false/,
  /consentApproved:\s*false/,
  /consentVersion:\s*""/,
  /attribution:\s*\{[^}]*\benabled:\s*false/,
  /analytics:\s*\{[^}]*\benabled:\s*false/,
  /consentGranted:\s*false/,
  /ga4MeasurementId:\s*""/,
  /adsConversionSendTo:\s*""/,
  /debug:\s*false/,
];

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

export async function verifyPublicSite(outputDirectory) {
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
  if (!REQUIRED_DISABLED_GATES.every((pattern) => pattern.test(config))) {
    throw new Error("El artefacto debe mantener apagadas todas las compuertas externas.");
  }
  return actual;
}

export async function buildPublicSite(outputDirectory) {
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
      await copyFile(source, destination);
    }
    return await verifyPublicSite(output);
  } catch (error) {
    await rm(output, { recursive: true, force: true });
    throw error;
  }
}

async function runCli() {
  const outIndex = process.argv.indexOf("--out");
  const output = outIndex >= 0 ? process.argv[outIndex + 1] : "";
  if (!output || output.startsWith("--")) {
    throw new Error("Uso: node scripts/build-public-site.mjs --out <directorio-nuevo-fuera-del-repo>");
  }
  const files = await buildPublicSite(output);
  console.log(`Artefacto verificado: ${files.length} archivos publicables.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
