# N.M.C & Abogados — Natalia Márquez Ceballos

Sitio web oficial del estudio jurídico **N.M.C & Abogados** (Centro de Negocios, Manizales, Caldas).

- **Dominio:** https://nmcabogada.com
- **Repositorio:** https://github.com/Jarcila19-pro/NMC-Abogados

## Tecnología

Web **estática** (sin CMS ni frameworks): HTML + CSS + JavaScript puro.

| Archivo / carpeta | Descripción |
|---|---|
| `index.html` | Página principal (todas las secciones) |
| `privacidad.html` | Política de tratamiento de datos personales (Ley 1581 de 2012) |
| `404.html` | Página de error (noindex) |
| `css/styles.css` | Estilos, colores de marca y diseño responsive (breakpoints 1024px / 600px) |
| `js/main.js` | Menú móvil accesible, scroll reveal, partículas, tarjetas de servicios, widget de WhatsApp y flujo del formulario |
| `js/config.js` | Configuración segura por defecto: endpoint, consentimiento, atribución y analítica desactivados |
| `js/form-core.js` | Saneamiento, validación, firma de reintento y construcción del payload |
| `js/registry.js` | Cliente del Web App de Apps Script: timeout, lectura y validación de la respuesta |
| `js/analytics.js` | Eventos preparados; GA4 y Ads permanecen apagados |
| `integracion/apps-script/Code.gs` | Backend de Apps Script: validación, idempotencia, bloqueo y escritura en Sheets |
| `scripts/build-public-site.mjs` | Constructor del artefacto público con allowlist y perfiles `safe`/`production` |
| `.github/workflows/pages.yml` | Pruebas unitarias, build y despliegue manual a GitHub Pages |
| `img/` | Logo, fotografías y versiones WebP optimizadas; favicons dedicados |
| `pruebas/` | Pruebas locales sin dependencias (Edge headless vía CDP) |
| `sitemap.xml` | Sitemap para buscadores |
| `robots.txt` | Reglas de rastreo |
| `CNAME` | Dominio personalizado de GitHub Pages (**no borrar**: si se elimina, `nmcabogada.com` deja de apuntar a la web) |
| `5aea0e8bff5cc5254c391c8c588c730b.txt` | Clave pública de verificación de **IndexNow** (Bing, DuckDuckGo, Yandex) — **no borrar**: los buscadores la consultan para aceptar los avisos de URLs nuevas |

## Despliegue

La publicación usa **GitHub Actions + GitHub Pages**, no un despliegue automático por `push`:

1. Un **Pull Request** hacia `main` ejecuta `node --test pruebas/unit-*.mjs` y compila el perfil `safe`; no publica.
2. La publicación se lanza manualmente con `workflow_dispatch` sobre `main`, `confirm_publication=true` y `profile=production`.
3. El workflow construye solo los archivos del allowlist (`scripts/build-public-site.mjs`), genera `js/config.js` de producción y sube el artefacto a Pages.
4. La URL `/exec` de Apps Script se toma de la variable de repositorio `NMC_PRODUCTION_REGISTRY_ENDPOINT`; no se guarda en el código.

> Un `push` a `main` por sí solo no publica. El artefacto excluye documentación interna, pruebas, scripts e `integracion/`.

## Publicación segura

- La protección de la rama `main` **no se pudo verificar** desde este entorno; no se afirma que exista ni que falte.
- Todo cambio debe pasar por rama y **Pull Request**; el PR valida unit tests y build `safe`.
- El despliegue de producción exige `workflow_dispatch` manual, `confirm_publication=true` y perfil `production`.
- **No borrar** `CNAME` (rompe el dominio personalizado) ni `5aea0e8bff5cc5254c391c8c588c730b.txt` (rompe la indexación vía IndexNow).

## Contenido de la página

Secciones: Hero · Marquesina · Quiénes Somos · Propósito · **Servicios** (Derecho Civil, Derecho Comercial, Derecho de Familia, Laboral y Seguridad Social) · Formación Académica · Por qué elegirnos · Preguntas frecuentes · Contacto · Footer.

El formulario valida nombre, teléfono, correo y área; exige el consentimiento **NMC-CONSENT-1.0**; envía un POST al Web App de Apps Script y solo ofrece **WhatsApp** (`wa.me/573146153979`) después de recibir un ID `NMC-...` válido. El backend registra la consulta en una hoja privada de Google Sheets con un esquema de 12 columnas (evidencia histórica; no revalidado en vivo en esta intervención) y devuelve el ID. No se envía ni se guarda el relato libre; solo se registra el área de consulta. Si el endpoint no está disponible, no se envía ningún dato. Los reintentos reutilizan una clave de idempotencia para evitar duplicados. Incluye límites de longitud, un aviso `noscript` y un estado accesible con `aria-live`.

## Rendimiento

- Fotografías y logo con versiones **WebP** y respaldo JPEG/PNG mediante `<picture>`.
- Logo de 400 px y favicons de 32/64 px más `apple-touch-icon` de 180 px.
- Cargador reducido a 250 ms; imágenes inferiores con `loading="lazy"` y dimensiones declaradas.
- Las fuentes siguen servidas por Google Fonts (decisión pendiente de aprobación para autoalojarlas).

## Pruebas locales

```bash
node --test pruebas/unit-*.mjs
node scripts/build-public-site.mjs --profile safe --out <directorio-nuevo-fuera-del-repo>
python -m http.server 8123 --bind 127.0.0.1
node pruebas/smoke.mjs        # estructura, FAQ, widget, enlaces y responsive
node pruebas/formulario.mjs   # registro simulado local; no accede a Google
node pruebas/visual.mjs       # capturas por sección en escritorio y móvil
```

Requieren Microsoft Edge instalado. No hay dependencias npm. El formulario E2E y el smoke necesitan el sitio servido en `http://127.0.0.1:8123/`.

## Privacidad

La política publicada y el consentimiento del formulario corresponden a **NMC-CONSENT-1.0** (vigente desde el 23 de noviembre de 2026). El formulario exige aceptación expresa antes de registrar. La analítica y la publicidad están apagadas; si se habilitan GA4 o Google Ads, la política debe actualizarse antes del despliegue.

## SEO

- Meta description, Open Graph y Twitter Cards.
- Datos estructurados JSON-LD: `Attorney` y `FAQPage`.
- `sitemap.xml` y `robots.txt` (mantener `lastmod` actualizado al editar contenido).
- `robots.txt` permite rastrear CSS y JavaScript, necesarios para renderizar el sitio.
- IndexNow: la clave está publicada en `5aea0e8bff5cc5254c391c8c588c730b.txt`; al agregar o cambiar páginas, notificar en `https://api.indexnow.org/indexnow`.
- Verificación de Google Search Console y Bing: pendiente (los metas están vacíos en `index.html`).

## Analítica

Google Analytics, Google Ads y la atribución UTM están **desactivados** en la configuración y el build de producción los fuerza a `false`. Habilitarlos requiere un paquete separado: IDs reales, consentimiento de analítica, actualización de privacidad, pruebas y un despliegue autorizado. No basta con editar `js/config.js`.

## Configuración

`js/config.js` contiene la configuración segura por defecto: `registryEndpoint` vacío, `consentApproved: false`, `consentVersion` vacío, `attribution.enabled: false` y `analytics.enabled: false`.

El perfil `production` del build exige:

- `NMC_REGISTRY_ENDPOINT` con una URL `/exec` de Apps Script (sin query ni fragmento), suministrada por la variable de repositorio `NMC_PRODUCTION_REGISTRY_ENDPOINT`.
- `consentVersion` exactamente `NMC-CONSENT-1.0`.
- `allowLocalRegistry: false`, `attribution.enabled: false`, `analytics.enabled: false`, `analytics.consentGranted: false` e IDs de GA4/Ads vacíos.

El endpoint `/exec` es público y no autentica el origen; cualquiera que lo conozca puede invocarlo, sujeto a validaciones, cuotas y al límite best-effort de 60 segundos. No es una credencial y no debe contener secretos.

## Producción GitHub y Apps Script

El sitio publicado en GitHub Pages y el Web App de Apps Script son dos artefactos distintos:

- GitHub Pages publica el frontend del allowlist desde `main`.
- Apps Script ejecuta el backend desplegado en la cuenta Google; su versión puede no coincidir con `integracion/apps-script/Code.gs` del repositorio.
- En esta intervención no se verificó en vivo el código desplegado, las Script Properties ni el esquema actual de la hoja. La estructura de 12 columnas es la que exige el código y existe evidencia histórica de una recepción real con ese esquema, pero no se revalidó aquí.

No se debe afirmar que el Apps Script desplegado es idéntico al archivo del repositorio sin una verificación directa.

## Documentación interna

`documentacion/` está ignorada por Git y no forma parte del artefacto público. `integracion/apps-script/README.md` es una guía interna y tampoco se publica.
