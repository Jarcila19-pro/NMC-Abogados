# Arquitectura y estructura

## Vista general

El producto es un sitio estático, sin CMS, framework de interfaz ni servidor
propio. GitHub Pages sirve las páginas y recursos estáticos. El backend de
captación de referencia está en Google Apps Script y escribe en Google Sheets;
es un servicio separado, con despliegue y configuración independientes del
repositorio.

Esta descripción refleja los archivos versionados. No confirma el estado ni la
versión desplegada de GitHub Pages, Apps Script o Sheets.

## Componentes

| Ruta | Responsabilidad |
|---|---|
| `index.html` | Página principal, metadatos, contenido, formulario, consentimiento y carga de scripts. |
| `privacidad.html` | Política publicada de tratamiento de datos. Su texto no constituye verificación legal independiente. |
| `404.html` | Página estática de error. |
| `css/styles.css`, `css/privacidad.css` | Presentación del sitio y la política. |
| `js/config.js` | Valores base seguros: endpoint vacío, registro y analítica apagados. |
| `js/form-core.js` | Saneamiento, validación cliente, firma SHA-256, clave idempotente, payload y enlace genérico de WhatsApp. |
| `js/registry.js` | POST al Web App, timeout, lectura JSON y validación de respuesta. |
| `js/main.js` | Interacción de UI, honeypot, consentimiento, reintento y secuencia de registro/WhatsApp. |
| `js/analytics.js` | Eventos y atribución preparados; las compuertas están apagadas en la configuración base. |
| `js/config-qa.local.js` | Configuración local ignorada por Git. `index.html` solo la carga desde localhost con `nmcQa=1`; no copiarla al sitio público. |
| `integracion/apps-script/Code.gs` | Backend de referencia: validación, bloqueo, idempotencia, escritura y respuesta JSON. |
| `scripts/build-public-site.mjs` | Crea y verifica el artefacto mediante una lista explícita de archivos. |
| `.github/workflows/pages.yml` | Pruebas/build en PR y publicación manual confirmada desde `main`. |
| `pruebas/` | Pruebas Node y harnesses de navegador local. |
| `CNAME`, `robots.txt`, `sitemap.xml`, `.nojekyll` | Archivos de dominio e indexación incluidos en la lista pública del builder. |
| `img/` | Logotipo, iconos e imágenes del sitio. |

No hay `package.json` en la raíz y las pruebas utilizan módulos incluidos con
Node.js; no se necesita instalar dependencias npm.

## Carga de scripts

En `index.html`, el orden es configuración, posible override local de QA,
`form-core.js`, `analytics.js`, `registry.js` y `main.js`. El override de QA
requiere hostname local y el parámetro `nmcQa=1`; la configuración de producción
no se obtiene de ese archivo. El builder no lo incluye en el artefacto.

## Recorrido del formulario

1. La página solicita nombre, teléfono, correo, área de consulta y autorización
   expresa. No existe un campo de relato libre. Un campo honeypot oculto no debe
   completarse.
2. `form-core.js` sanea los valores y valida nombre (2–80 caracteres), teléfono
   (7–15 dígitos), correo (máximo 120 caracteres) y una de las áreas permitidas.
   La interfaz y el backend realizan validaciones separadas.
3. `main.js` exige `consentApproved`, `consentVersion` y un endpoint configurado.
   Si falta cualquiera, informa que el registro no está disponible y no envía
   el payload.
4. El cliente calcula una firma SHA-256 del intento y conserva en
   `sessionStorage` la clave de idempotencia asociada mientras se resuelve el
   resultado. La clave no autentica a quien envía.
5. `registry.js` envía un POST `text/plain;charset=utf-8` con JSON, sin
   credenciales, sigue redirecciones y cancela la espera tras el timeout
   configurado (12 000 ms por defecto). Solo acepta JSON con `ok: true` e ID
   válido `NMC-` más 32 caracteres hexadecimales.
6. El navegador ofrece un enlace a WhatsApp únicamente después de esa
   confirmación. El texto generado es un saludo genérico; la persona lo revisa
   y decide si lo envía. El ID de registro no se añade al enlace.
7. Ante un resultado incierto, el cliente conserva el intento y reintenta con
   la misma clave en la sesión. Un timeout puede ocurrir después de que Sheets
   haya guardado la fila; el reintento idempotente permite recuperar el mismo
   ID mientras se conserve la clave.

## Contrato cliente-servidor

El payload de referencia incluye `nombre`, `telefono`, `email`, `servicio`,
`consentimiento`, `consentVersion`, `utmSource`, `utmMedium`, `utmCampaign`,
`website` (honeypot) y `claveIdempotencia`. No incluye mensaje libre, documentos
ni datos del caso. La atribución está desactivada en la configuración base; el
backend solo reconoce el tuple fijo `google/cpc/search` y persiste una etiqueta
fija, no los valores UTM arbitrarios.

`Code.gs` rechaza cuerpos mayores de 8 000 caracteres, requiere consentimiento
verdadero y versión coincidente con Script Properties, valida los campos y
áreas, y verifica que el honeypot esté vacío. Bajo un bloqueo del script busca
primero la clave existente; para solicitudes nuevas usa `CacheService` como
límite best-effort de 60 segundos por identidad derivada de correo y teléfono.
Después genera el ID, agrega la fila y ejecuta `SpreadsheetApp.flush()` antes
de confirmar.

La respuesta satisfactoria contiene `ok`, `id` y `fecha`; en una repetición
puede incluir `duplicado: true`. Los rechazos incluyen un `code` como
`VALIDATION`, `DISABLED`, `BUSY` o `RATE_LIMITED`. Los errores internos no se
devuelven como trazas al navegador.

### Esquema esperado por el código

La pestaña `Registro de consultas` debe tener exactamente estos encabezados, en
este orden:

1. `ID`
2. `Fecha de recepción`
3. `Nombre`
4. `Teléfono`
5. `Correo`
6. `Área de consulta`
7. `Estado`
8. `Fecha de seguimiento`
9. `Responsable`
10. `Fuente`
11. `Idempotencia`
12. `Versión de consentimiento`

La discrepancia de orden, cantidad o texto hace fallar la validación del
backend. `setupSheet()` trabaja sobre la pestaña existente y no debe ejecutarse
en producción como prueba. El código local no prueba el esquema de una hoja
real.

## Analítica y atribución

`js/analytics.js` solo carga Google Analytics cuando están habilitados tanto la
analítica como su consentimiento y existe un identificador válido. La
configuración versionada mantiene las compuertas apagadas y el builder exige
que sigan apagadas en ambos perfiles. Los eventos locales en `dataLayer` no
demuestran envío a GA4. `whatsapp_click` no equivale a consulta ni cita;
`appointment_confirmed` no está implementado.

## Artefacto público

`scripts/build-public-site.mjs` usa `PUBLIC_FILES` como allowlist; verifica
archivos regulares, rechaza enlaces simbólicos y compara el conjunto final con
la lista exacta. Excluye `documentacion/`, `docs/`, `integracion/`,
`pruebas/`, `scripts/`, workflows y el override local de QA. El constructor
requiere un destino nuevo fuera del repositorio y no sobrescribe destinos
existentes.

La allowlist describe el artefacto creado por el workflow; por sí sola no
demuestra que la configuración remota de Pages esté usando GitHub Actions.
