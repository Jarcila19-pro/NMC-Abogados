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
| `js/main.js` | Menú móvil accesible, scroll reveal, partículas, tarjetas de servicios, widget de WhatsApp y formulario |
| `img/` | Logo, fotografías y versiones WebP optimizadas; favicons dedicados |
| `pruebas/` | Pruebas locales sin dependencias (Edge headless vía CDP) |
| `sitemap.xml` | Sitemap para buscadores |
| `robots.txt` | Reglas de rastreo |
| `CNAME` | Dominio personalizado de GitHub Pages (**no borrar**: si se elimina, `nmcabogada.com` deja de apuntar a la web) |
| `5aea0e8bff5cc5254c391c8c588c730b.txt` | Clave pública de verificación de **IndexNow** (Bing, DuckDuckGo, Yandex) — **no borrar**: los buscadores la consultan para aceptar los avisos de URLs nuevas |

## Despliegue

El sitio se publica con **GitHub Pages**:

1. Hacer `git push` a la rama `main`.
2. GitHub Pages reconstruye y publica automáticamente (1–3 minutos).
3. Verificar en: https://nmcabogada.com

> Los cambios hechos solo en una carpeta local **no** aparecen en la web hasta que se suben al repositorio.

## Publicación segura

- La rama `main` **no tiene protección**: cualquier `push` se publica en el sitio en 1–3 minutos.
- Para cambios de terceros se recomienda trabajar en una rama y abrir un **Pull Request** para revisión antes de fusionar a `main`.
- **No borrar** `CNAME` (rompe el dominio personalizado) ni `5aea0e8bff5cc5254c391c8c588c730b.txt` (rompe la indexación vía IndexNow).

## Contenido de la página

Secciones: Hero · Marquesina · Quiénes Somos · Propósito · **Servicios** (Derecho Civil, Derecho Comercial, Derecho de Familia, Laboral y Seguridad Social) · Formación Académica · Por qué elegirnos · Preguntas frecuentes · Contacto · Footer.

El formulario valida los datos, prepara un mensaje codificado y abre **WhatsApp** (`wa.me/573146153979`). No envía ni almacena registros: la persona debe pulsar «Enviar» dentro de WhatsApp. Si el navegador bloquea la ventana, conserva los datos y ofrece un enlace manual. Incluye límites de longitud, un aviso `noscript` y un estado accesible con `aria-live`.

## Rendimiento

- Fotografías y logo con versiones **WebP** y respaldo JPEG/PNG mediante `<picture>`.
- Logo de 400 px y favicons de 32/64 px más `apple-touch-icon` de 180 px.
- Cargador reducido a 250 ms; imágenes inferiores con `loading="lazy"` y dimensiones declaradas.
- Las fuentes siguen servidas por Google Fonts (decisión pendiente de aprobación para autoalojarlas).

## Pruebas locales

```bash
python -m http.server 8123 --bind 127.0.0.1
node pruebas/smoke.mjs      # estructura, FAQ, widget, enlaces y responsive
node pruebas/visual.mjs     # capturas por sección en escritorio y móvil
```

Requieren Microsoft Edge instalado. No hay dependencias npm.

## Privacidad

La política de tratamiento y el consentimiento del formulario están **pendientes de revisión y aprobación** por la abogada. No debe publicarse captación con almacenamiento de consultas hasta que exista un texto aprobado.

## SEO

- Meta description, Open Graph y Twitter Cards.
- Datos estructurados JSON-LD: `Attorney` y `FAQPage`.
- `sitemap.xml` y `robots.txt` (mantener `lastmod` actualizado al editar contenido).
- `robots.txt` permite rastrear CSS y JavaScript, necesarios para renderizar el sitio.
- IndexNow: la clave está publicada en `5aea0e8bff5cc5254c391c8c588c730b.txt`; al agregar o cambiar páginas, notificar en `https://api.indexnow.org/indexnow`.
- Verificación de Google Search Console y Bing: pendiente (los metas están vacíos en `index.html`).

## Analítica

Actualmente **no** tiene Google Analytics instalado. Si se instala GA4, el snippet `gtag.js` va en el `<head>` de `index.html` con el ID de medición `G-XXXXXXXXXX`.
