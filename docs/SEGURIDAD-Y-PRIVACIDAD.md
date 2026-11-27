# Seguridad y privacidad

## Alcance y nivel de evidencia

Esta es documentación técnica del código local, no una auditoría de seguridad
independiente, certificación legal ni garantía de seguridad absoluta.

- **Implementado y comprobable en el código local:** conducta visible en los
  archivos versionados y pruebas con dobles locales.
- **Implementado según el código, producción no verificada:** la lógica existe
  localmente, pero no se inspeccionó el deployment, sus permisos o servicios
  reales.
- **Pendiente de autorización:** requiere una decisión de la titular del
  tratamiento o del administrador autorizado.
- **Recomendación futura:** oportunidad aún no implementada; no cambiar en
  producción sin aprobación y su propio procedimiento.

## Superficie de exposición

- Páginas, recursos y código JavaScript públicos en GitHub/Pages.
- Formulario y endpoint de Web App de Apps Script, si se configura y despliega.
- Hoja de Google Sheets y cuentas/Script Properties que el backend use.
- GitHub Actions, variables, reglas de rama y entorno de despliegue.
- Recursos externos de Google Fonts y enlace voluntario a WhatsApp.

El repositorio es público. La allowlist del builder limita el artefacto de Pages
construido por el workflow, pero no hace privado el código versionado ni prueba
qué fuente utiliza Pages en Settings. La carpeta local `documentacion/` está
ignorada por Git; eso evita el seguimiento normal, no la respalda ni protege
contra acceso local no autorizado.

## Datos y privacidad

**Implementado según el código:** el formulario contiene nombre, teléfono,
correo, área y casilla de consentimiento. No contiene un campo de relato. El
payload de referencia no incluye historia libre; el backend local escribe los
campos de contacto, área, estado, fuente fija opcional, clave de idempotencia y
versión del consentimiento. La página advierte no incluir información sensible
o confidencial en los campos.

El enlace posterior a WhatsApp lleva un saludo genérico y no añade el ID de
registro ni los campos del formulario. La persona decide qué escribir y si lo
envía. El uso del canal de WhatsApp y los datos que la persona escriba allí son
un flujo separado.

La política publicada describe finalidades y derechos, pero esta misión no
revisó su suficiencia legal. El código no determina plazo de retención ni
automatiza eliminación. No se verificaron el responsable operativo, la hoja
real, sus permisos, respaldos, los datos allí conservados ni procedimientos
legales aplicables.

## Validaciones y controles presentes

**Implementado y comprobable localmente:**

- Validación cliente y repetición de validación en servidor: nombre, teléfono,
  correo, áreas permitidas, consentimiento y versión.
- Saneamiento y límites de longitud; cuerpo JSON máximo de 8 000 caracteres.
- Honeypot validado en cliente y servidor. No es una barrera contra un bot que
  imite el protocolo.
- Protección contra fórmulas en Sheets: prefija con apóstrofo valores que
  comiencen con patrones de fórmula.
- `LockService` serializa el tramo de búsqueda/escritura.
- La búsqueda de clave idempotente ocurre antes del límite de solicitudes; la
  misma clave existente devuelve el mismo ID en lugar de insertar otra fila.
- El límite basado en `CacheService` es best-effort: 60 segundos por un digest
  de correo y teléfono. La caché puede ser desalojada y cambiar la identidad
  permite evadirlo.
- Las salidas de error del backend no incluyen trazas internas. El cliente
  exige respuesta JSON legible y un ID válido antes de confirmar.
- Timeout cliente configurado en 12 segundos por defecto, que cubre la espera
  de respuesta y lectura. Un timeout no prueba que el servidor no haya escrito;
  la clave idempotente sirve para consultar de nuevo en el mismo intento.
- La configuración base y el builder mantienen registro, analítica y
  atribución desactivados, salvo que un build de producción autorizado pase sus
  validaciones.

Las pruebas unitarias que simulan Apps Script no prueban permisos, cuotas,
redirecciones, CORS, escritura o comportamiento de Google en producción.

## Riesgos y límites

- El endpoint de Web App, si se publica para un frontend estático, es invocable
  desde fuera del sitio. El código no autentica usuarios ni el origen; `Origin`
  y `Referer` no son una autenticación. La URL no es un secreto.
- No hay CAPTCHA ni límite por IP. Honeypot, bloqueo y caché best-effort no
  impiden abuso, spam ni agotamiento de cuotas de Google.
- Una respuesta puede perderse después de la escritura; el usuario puede ver
  estado incierto. La clave guardada en `sessionStorage` solo ayuda mientras
  ese estado del navegador esté disponible.
- Apps Script puede redirigir la respuesta y la política CORS efectiva depende
  del servicio. No se verificó la lectura JSON desde un navegador contra un
  deployment real.
- Los permisos requeridos y consentidos por Google, el modo de ejecución, el
  acceso anónimo y las cuotas vigentes no se comprobaron. `MailApp` solo es
  relevante si se configura la notificación opcional.
- Las propiedades `SPREADSHEET_ID`, `REGISTRY_ENABLED`,
  `CONSENT_APPROVED`, `CONSENT_VERSION` y `NOTIFY_EMAIL` se leen en el código.
  Sus valores efectivos y permisos de acceso no se verificaron.
- La variable de GitHub `NMC_PRODUCTION_REGISTRY_ENDPOINT` está referenciada
  en el workflow; su existencia y valor no se verificaron.
- No hay evidencia de backups automatizados ni prueba de restauración.

## Acceso mínimo recomendado

Esto es una recomendación, no un estado verificado: restringir la hoja a
cuentas individuales autorizadas; no compartir por enlace público; usar MFA;
separar el proyecto y la hoja de QA de producción; revisar periódicamente
permisos, editores, deployments y accesos de GitHub/Google; no usar cuentas
personales como destino de datos; y documentar custodio y operadores por canal
interno aprobado.

No copiar valores de propiedades, endpoint, identificadores de hoja,
credenciales ni datos de titulares a commits, Issues, capturas, logs
compartidos o tickets.

## Copias de seguridad y recuperación

No se encontró ni verificó un mecanismo automatizado de backup. Hasta que la
titular y el custodio aprueben un procedimiento, no exportar la hoja a destinos
no autorizados. Como recomendación, acordar frecuencia, cifrado, acceso,
retención, ubicación y responsable de copias; probar recuperación en un entorno
aislado con datos sintéticos; registrar el resultado sin copiar datos de
clientes.

El frontend puede reconstruirse desde un commit revisado y un deployment
autorizado. Esto no restaura Apps Script, Script Properties, Sheets, DNS o
variables de Actions. Para recuperación de Google, el custodio debe usar las
opciones disponibles en la cuenta y confirmar la integridad con un proceso
aprobado; no se afirma que exista una copia restaurable.

## Revocación, rotación e incidentes

Ante sospecha de exposición o abuso, el operador autorizado debe coordinar con
la responsable: detener la aceptación en Apps Script (`REGISTRY_ENABLED=false`
en las propiedades del proyecto afectado), conservar evidencia técnica mínima
sin payloads personales, revisar ejecuciones/permisos y determinar el alcance
desde cuentas autorizadas. Deshabilitar la propiedad no invalida por sí solo
un endpoint accesible ni revoca su URL.

Si se necesita revocar una URL, quien administre Google debe desactivar o retirar
el deployment afectado y confirmar el resultado; si corresponde, crear y
probar un deployment nuevo aislado y cambiar la variable de publicación
mediante una release autorizada. Revocar usuarios o permisos que ya no deban
tener acceso. No editar ni eliminar datos como respuesta inicial a un
incidente.

El responsable legal/operativo debe determinar notificaciones y acciones sobre
datos. Este repositorio no define plazos de conservación ni un protocolo legal
certificado. Registrar fecha, alcance, decisiones y responsables por un canal
privado aprobado; no registrar PII innecesaria.

## Pendientes antes de activar o cambiar una integración

1. **Pendiente de autorización:** aprobación de finalidades, texto de
   autorización, destinatarios, conservación/eliminación y responsables.
2. **Pendiente de verificación externa:** código desplegado, propiedades,
   permisos de la hoja, respuesta/cors, cuotas y acceso permitido del Web App.
3. **Recomendación futura:** valorar controles de abuso adecuados al riesgo y
   alertas operativas antes de captar datos.
4. **Recomendación futura:** evaluar GA4/Ads solo tras autorización y revisión
   de privacidad; no transmitir datos de contacto ni tratar clics a WhatsApp
   como citas.
