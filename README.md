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
| `js/main.js` | Loader, cursor, menú móvil, scroll reveal, partículas y tarjetas de servicios |
| `img/` | Logo y fotografías |
| `sitemap.xml` | Sitemap para buscadores |
| `robots.txt` | Reglas de rastreo |
| `CNAME` | Dominio personalizado de GitHub Pages (**no borrar**: si se elimina, `nmcabogada.com` deja de apuntar a la web) |

## Despliegue

El sitio se publica con **GitHub Pages**:

1. Hacer `git push` a la rama `main`.
2. GitHub Pages reconstruye y publica automáticamente (1–3 minutos).
3. Verificar en: https://nmcabogada.com

> Los cambios hechos solo en una carpeta local **no** aparecen en la web hasta que se suben al repositorio.

## Contenido de la página

Secciones: Hero · Marquesina · Quiénes Somos · Propósito · **Servicios** (Derecho Civil, Derecho Comercial, Derecho de Familia, Laboral y Seguridad Social) · Formación Académica · Por qué elegirnos · Contacto · Footer.

El formulario de contacto no envía correos: construye un mensaje y abre **WhatsApp** (`wa.me/573146153979`) para que el usuario lo envíe.

## SEO

- Meta description, Open Graph y Twitter Cards.
- Datos estructurados JSON-LD: `Attorney` y `FAQPage`.
- `sitemap.xml` y `robots.txt` (mantener `lastmod` actualizado al editar contenido).
- Verificación de Google Search Console y Bing: pendiente (los metas están vacíos en `index.html`).

## Analítica

Actualmente **no** tiene Google Analytics instalado. Si se instala GA4, el snippet `gtag.js` va en el `<head>` de `index.html` con el ID de medición `G-XXXXXXXXXX`.
