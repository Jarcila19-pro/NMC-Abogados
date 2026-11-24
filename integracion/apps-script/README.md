# Guía interna de despliegue y operación — Registro NMC

**Uso interno de Juan López Studio y N.M.C & Abogados. No publicar ni desplegar este documento.**

## Estado comprobado

- El spreadsheet real `NMC - Registro de consultas` y el proyecto Apps Script vinculado existen. La pestaña real `Registro de consultas` aún conserva el esquema anterior de 9 encabezados; este backend exige el esquema objetivo de 12 y no se ha conectado.
- El proyecto Apps Script vinculado contiene únicamente `crearEstructuraNMC()`; no contiene este backend y no tiene implementaciones activas ni archivadas.
- `registryEndpoint` y `consentVersion` están vacíos; `consentApproved`, `analytics.enabled` y `allowLocalRegistry` están en `false`.
- No se ha desplegado este backend como Web App ni validado CORS/redirect contra Google.
- El consentimiento y la política son borradores pendientes de aprobación de Natalia. Finalidad, conservación y eliminación deben aprobarse antes de captar consultas.

Esta guía define un procedimiento; no es evidencia de una integración real ni una aprobación legal.

## Arquitectura y contrato

1. `index.html` carga `js/config.js`, `js/form-core.js`, `js/analytics.js`, `js/registry.js` y `js/main.js`.
2. `main.js` sanea y valida el formulario, exige el consentimiento aprobado y la versión configurada, crea/reutiliza una clave de idempotencia y llama a `NMCRegistry`.
3. `registry.js` envía un POST `text/plain;charset=utf-8` con JSON, `credentials: omit`, redirección seguida y un timeout total. Solo acepta una respuesta JSON `ok: true` con ID `NMC-` más 32 caracteres hexadecimales (UUID completo).
4. `Code.gs` vuelve a validar, verifica la configuración y el honeypot, toma un bloqueo, busca la clave idempotente y aplica una limitación best-effort de 60 segundos por correo/teléfono hasheados.
5. Apps Script agrega una fila a una hoja privada y hace `SpreadsheetApp.flush()`. Solo entonces responde con ID y fecha.
6. El navegador ofrece WhatsApp solo después de esa respuesta válida. Un error conserva los campos y no presenta la consulta como registrada.

El mensaje libre **no se envía al endpoint, no se guarda en Sheets y tampoco se incluye en el enlace de WhatsApp**. Tras confirmar el registro, WhatsApp abre con el saludo genérico `Hola, quisiera solicitar información.`; la persona decide qué escribir y debe pulsar «Enviar». Si la atribución se habilita con autorización, cliente y servidor aceptan únicamente el conjunto exacto `utm_source=google`, `utm_medium=cpc`, `utm_campaign=search`; cualquier valor faltante, duplicado, inesperado o excesivo se descarta. El backend guarda solo esa etiqueta fija. No se envían ni guardan `gclid`, términos/contenido UTM, referente, página, idioma ni timestamp del navegador. La configuración actual mantiene la atribución desactivada.

### Archivos

| Archivo | Responsabilidad |
|---|---|
| `index.html` | Campos, aviso provisional, consentimiento requerido, honeypot y mensajes accesibles. |
| `css/styles.css` | Presentación del formulario y estados. |
| `js/config.js` | Gating local de endpoint, consentimiento, pruebas localhost y analítica. |
| `js/form-core.js` | Saneamiento, validación, firma de repetición y construcción de payload/WhatsApp. |
| `js/registry.js` | Transporte, timeout, lectura y validación de respuesta. |
| `js/main.js` | Flujo consentimiento → registro confirmado → opción de WhatsApp. |
| `js/analytics.js` | Eventos preparados; no carga GA4 con la configuración actual. |
| `integracion/apps-script/Code.gs` | Validación de servidor, idempotencia, escritura y respuesta JSON. |
| `pruebas/unit-*.mjs`, `pruebas/formulario.mjs`, `pruebas/smoke.mjs` | Pruebas locales y simuladas; no acceden a Google. |

## Hoja operativa

El backend trabaja exclusivamente con una pestaña llamada `Registro de consultas`. `setupSheet()` puede renombrar una pestaña existente llamada `Hoja 1`, configurar los 12 encabezados exactos y validar el esquema. No crea otro spreadsheet, no cambia el título del documento, no crea pestañas nuevas si falta la requerida y no modifica registros existentes. Los 12 encabezados deben coincidir exactamente en nombre, cantidad y orden:

| Col. | Encabezado | Tipo/uso |
|---|---|---|
| A | `ID` | Texto, identificador generado por servidor (`NMC-` + UUID completo en hexadecimal). |
| B | `Fecha de recepción` | Fecha/hora del servidor, almacenada como fecha de Sheets. |
| C | `Nombre` | Texto de contacto. |
| D | `Teléfono` | Texto de contacto; no convertir a número. |
| E | `Correo` | Texto de contacto normalizado a minúsculas. |
| F | `Área de consulta` | Una de `Civil`, `Comercial`, `Familia`, `Laboral` o `No especificado`. El payload conserva la propiedad `servicio` por compatibilidad con el cliente; si falta, el backend guarda `No especificado`. |
| G | `Estado` | Estado operativo; inicia en `Nueva`. |
| H | `Fecha de seguimiento` | Fecha operativa; vacía al crear. |
| I | `Responsable` | Asignación operativa manual; vacía al crear. |
| J | `Fuente` | Etiqueta fija `source=google | medium=cpc | campaign=search` si se permite el tuple UTM exacto; en otro caso `Sin atribucion`. No guarda el referente ni valores UTM arbitrarios. |
| K | `Idempotencia` | Clave técnica no personal generada por el cliente; persistida para deduplicar reintentos. No editar manualmente. |
| L | `Versión de consentimiento` | Versión recibida y validada contra Script Properties; no sustituye evidencia legal adicional. |

Estados propuestos para validación de datos de la hoja:

`Nueva` · `Pendiente de contacto` · `Contactada` · `Cita agendada` · `Cita atendida` · `Cerrada` · `No contactada`.

El código inicia en `Nueva`; los estados posteriores y la asignación de responsable son gestión manual. Mantener encabezados, orden y nombres exactos; cualquier columna faltante, adicional o desordenada hace que el servidor falle cerrado. No insertar columnas dentro del esquema ni usar la hoja como expediente jurídico. La pestaña real aún no tiene este esquema; no conectar ni ejecutar el backend contra ella hasta que el cambio de esquema haya sido autorizado y verificado.

### Operación diaria

- Mantener la hoja privada en la cuenta autorizada de NMC; MFA y acceso individual mínimo. No usar enlaces «cualquier persona con el enlace».
- Usar filtros por `Estado`, `Fecha de recepción` y `Fecha de seguimiento`; registrar solo la gestión necesaria. Actualizar estado, responsable y fecha de seguimiento al asignar o completar una gestión.
- No copiar el relato del caso, documentos, salud, datos de menores, contraseñas ni datos de contrapartes. El `Área de consulta` es una categoría general, no un resumen del caso.
- No enviar nombres, teléfonos, correos ni relatos por correo de notificación. `NOTIFY_EMAIL`, si se aprueba, solo recibe un aviso con el ID.
- Acordar con Natalia responsable de seguimiento, acceso y procedimiento de eliminación conforme al plazo de conservación que ella apruebe. No se ha supuesto ni implementado un plazo.
- Revisar periódicamente usuarios con acceso, ejecuciones, cuotas y errores; no exportar la hoja a cuentas personales.

## Configuración

### En el proyecto Apps Script

Crear estas **Script Properties** desde `Configuración del proyecto → Propiedades del script`. No guardar valores reales en el repositorio, capturas, tickets o consola compartida.

| Propiedad | Uso |
|---|---|
| `SPREADSHEET_ID` | ID de la hoja privada elegida. No es una contraseña, pero tratarlo como dato interno y no incluirlo en código cliente. |
| `CONSENT_VERSION` | Identificador de la versión del consentimiento aprobado por Natalia; debe coincidir exactamente con la configuración del sitio. |
| `CONSENT_APPROVED` | `false` hasta aprobación expresa y documentada; después `true`. |
| `REGISTRY_ENABLED` | `false` por defecto. Solo habilitar en la ventana de activación acordada tras superar QA y autorizaciones. |
| `NOTIFY_EMAIL` | Opcional; buzón institucional aprobado. Vacío si no se necesita. |

No añadir credenciales ni secretos al código Apps Script. `SPREADSHEET_ID` se guarda solo como Script Property.

### En el sitio (configuración local)

`js/config.js`:

- `registryEndpoint`: URL `/exec`; vacío mantiene el registro fuera de servicio.
- `registryTimeoutMs`: límite total del envío y lectura.
- `allowLocalRegistry`: debe permanecer `false`; solo el harness local lo habilita para mocks en `127.0.0.1`.
- `consentApproved` y `consentVersion`: no cambiar hasta que Natalia apruebe texto, finalidad, política y versión.
- `attribution.enabled`: permanece en `false`; no almacenar UTM sin aprobación comercial y de privacidad.
- `analytics.enabled`, `ga4MeasurementId` y `adsConversionSendTo`: no habilitar sin ID real, autorización y aprobación de privacidad.

La URL `/exec` no es una credencial; es un endpoint público. No ofrece autenticación de origen: cualquiera que la conozca puede invocarlo, sujeto a las validaciones y cuotas. No colocar en ella claves de acceso ni parámetros secretos.

## Procedimiento de despliegue en dos entornos

Todas las acciones de esta sección son futuras y requieren autorización y acceso de la cuenta NMC. No se han ejecutado.

### A. Preparar entorno de prueba aislado

1. Obtener autorización de Natalia y usar una cuenta Google administrada por NMC, con MFA. No crear recursos en una cuenta personal del desarrollador.
2. Crear una **hoja de prueba privada separada** de cualquier hoja operativa. No compartirla públicamente.
3. En una hoja vacía, abrir Apps Script y crear un proyecto de prueba bajo la misma cuenta. Copiar `Code.gs`; no pegar IDs o URLs reales en el repositorio.
4. Añadir Script Properties apuntando a la hoja de prueba. Empezar con `REGISTRY_ENABLED=false` y `CONSENT_APPROVED=false`. Para habilitar escrituras de QA, usar una versión de consentimiento de prueba aprobada para el ejercicio y datos estrictamente ficticios.
5. Para una hoja nueva con una sola pestaña `Hoja 1`, configurar `SPREADSHEET_ID` y ejecutar `setupSheet()` una vez; renombrará la pestaña y escribirá los 12 encabezados sin cambiar el título del documento. Si ya existiera `Registro de consultas`, la función configurará y validará sus encabezados. Autorizar solo los permisos presentados por Google. Se necesita lectura/escritura de Sheets; si se configura `NOTIFY_EMAIL`, Google puede solicitar permiso de envío de correo.
6. Desplegar como Web App: **ejecutar como la cuenta NMC propietaria**. Para un sitio público estático sin sesión de usuario, el acceso anónimo («cualquier persona / Anyone») puede ser necesario. Es acceso público, no una restricción al dominio del sitio. Si la organización no permite ese nivel, detenerse y acordar otra arquitectura; no relajar controles ni asumir que CORS restringe el origen.
7. Copiar la URL `/exec` solo a un canal local/autorizado. No añadirla a este documento ni a logs.
8. Habilitar la configuración **solo en el proyecto de prueba** durante QA. Invocar con datos ficticios siguiendo el ejemplo de abajo; repetir exactamente la clave de idempotencia y comprobar que devuelve el mismo ID con `duplicado: true` y queda una sola fila.
9. Ejecutar QA desde un servidor local y desde un entorno de prueba HTTPS. Verificar en navegador la solicitud, respuesta final y consola. El navegador debe poder leer el JSON después de la redirección de Apps Script. Si CORS, la redirección o el tipo de contenido falla, bloquear el lanzamiento; no usar `no-cors` ni tratar una respuesta opaca como éxito.
10. Al terminar, poner `REGISTRY_ENABLED=false`, retirar el deployment de prueba y eliminar las filas ficticias según el procedimiento aprobado. Nunca reutilizar la hoja de prueba para consultas reales.

### B. Crear la instancia de producción (no activar aún)

1. Solo tras aprobación de Natalia, autorizar el uso de la hoja privada en la cuenta NMC y aplicar el esquema objetivo de 12 columnas mediante un procedimiento separado. La hoja actual de 9 columnas no coincide y no debe usarse con este backend hasta adaptarla.
2. Crear un proyecto Apps Script de producción separado, pegar el código validado y asignar `SPREADSHEET_ID` de producción como Script Property.
3. Dejar `REGISTRY_ENABLED=false` hasta el go-live autorizado. No usar registros de clientes como prueba.
4. Ejecutar `setupSheet()` para comprobar los encabezados/permisos. Desplegar como Web App que ejecuta como NMC. El acceso anónimo es una decisión explícita de riesgo; no ofrecer la hoja, solo el endpoint.
5. Copiar la nueva URL `/exec` localmente. Registrar quién la recibió y dónde quedó guardada, nunca en el código público ni en este archivo.
6. La configuración del sitio no se activa en esta misión. El cambio futuro a `registryEndpoint`, `consentApproved` y `consentVersion` requiere aprobación y un despliegue independiente del sitio.
7. Activar `CONSENT_APPROVED` y `REGISTRY_ENABLED` solo en la ventana de go-live aprobada, con responsable monitorizando Apps Script y la hoja. GA4 es una autorización/configuración separada.

### Ejemplo de prueba manual (solo entorno de prueba)

Sustituir los marcadores **en la terminal local** por el endpoint de prueba y la versión de prueba aprobada. El script usa correo reservado `.test`, identidad ficticia y clave aleatoria:

```powershell
$endpoint = Read-Host "URL /exec del entorno de prueba"
$scope = Read-Host "Escribe QA para confirmar que es un proyecto aislado de prueba"
if ($scope -cne "QA") { throw "Cancelado; no se enviaron datos." }
$consentVersion = Read-Host "Versión de consentimiento de prueba"
$key = "nmc-" + [guid]::NewGuid().ToString().ToLowerInvariant()
$body = @{
  nombre = "QA Ficticia"
  telefono = "2025550100"
  email = "qa@example.test"
  servicio = "No especificado"
  consentimiento = $true
  consentVersion = $consentVersion
  claveIdempotencia = $key
  website = ""
} | ConvertTo-Json -Compress

$first = Invoke-RestMethod -Uri $endpoint -Method Post `
  -ContentType "text/plain;charset=utf-8" -Body $body
if ($first.ok -ne $true -or $first.id -notmatch '^NMC-[A-F0-9]{32}$') {
  throw "La primera respuesta no confirma un registro válido."
}

$second = Invoke-RestMethod -Uri $endpoint -Method Post `
  -ContentType "text/plain;charset=utf-8" -Body $body
if ($second.ok -ne $true -or $second.id -ne $first.id -or $second.duplicado -ne $true) {
  throw "El reintento no devolvió el mismo registro idempotente."
}

[pscustomobject]@{
  PrimeraRespuesta = $first.ok
  Id = $first.id
  ReintentoDuplicado = $second.duplicado
}
```

Ejecutar únicamente con el endpoint del proyecto de prueba y su consentimiento/versión de QA autorizados; nunca pegar la URL de producción. El segundo POST debe devolver el mismo ID con `duplicado: true`. Verificar en la hoja una sola fila nueva y que los encabezados A–L sigan exactamente en el orden de la tabla anterior. No ejecutar contra producción.

### QA de interfaz desde una copia aislada del RC

Este procedimiento sirve para verificar desde el navegador la redirección/CORS de Apps Script y que WhatsApp solo se abre tras la respuesta válida. No modifica el repositorio ni el RC original. Requiere que el entorno de prueba anterior ya esté autorizado y desplegado. La hoja debe ser privada, de prueba y sin datos operativos; `setupSheet()` debe haber validado los 12 encabezados exactos antes del POST.

1. En una terminal PowerShell, indicar la ruta del RC verificado, la URL `/exec` **del proyecto de prueba** y la versión de consentimiento de QA aprobada. El bloque crea una copia temporal y modifica únicamente su `js/config.js`; mantiene atribución, GA4 y Ads apagados:

```powershell
$rc = Read-Host "Ruta absoluta del RC verificado"
$endpoint = Read-Host "URL /exec del Web App de prueba (no producción)"
$scope = Read-Host "Escribe QA para confirmar que es un proyecto aislado de prueba"
if ($scope -cne "QA") { throw "Cancelado; no se configuró la copia." }
$consentVersion = Read-Host "Versión de consentimiento QA aprobada (qa-...)"
if (!(Test-Path -LiteralPath (Join-Path $rc "index.html"))) { throw "No se encontró el RC." }
if ($endpoint -notmatch '^https://script\.google\.com/macros/s/[^/]+/exec$') {
  throw "Usa la URL /exec del Web App de prueba."
}
if ($consentVersion -notmatch '^qa-[A-Za-z0-9._-]{1,34}$') {
  throw "La versión QA debe empezar con qa- y tener como máximo 37 caracteres."
}

$qa = Join-Path $env:TEMP ("nmc-qa-ui-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $qa | Out-Null
Copy-Item -Path (Join-Path $rc "*") -Destination $qa -Recurse -Force
$endpointJson = ConvertTo-Json -InputObject $endpoint -Compress
$versionJson = ConvertTo-Json -InputObject $consentVersion -Compress
$config = @"
window.NMC_CONFIG = {
  whatsappNumber: "573146153979",
  registryEndpoint: $endpointJson,
  registryTimeoutMs: 12000,
  allowLocalRegistry: false,
  consentApproved: true,
  consentVersion: $versionJson,
  attribution: { enabled: false },
  analytics: {
    enabled: false,
    consentGranted: false,
    ga4MeasurementId: "",
    adsConversionSendTo: "",
    debug: false
  }
};
"@
Set-Content -LiteralPath (Join-Path $qa "js\config.js") -Value $config -Encoding UTF8
Write-Output "Copia temporal QA: $qa"
```

2. Solo después de comprobar que las Script Properties pertenecen al proyecto de prueba, establecer allí `SPREADSHEET_ID`, `CONSENT_VERSION`, `CONSENT_APPROVED=true` y `REGISTRY_ENABLED=true` durante la ventana autorizada. Mantener `REGISTRY_ENABLED=false` en producción. Si no se aprueba el consentimiento específico de QA o no se autoriza el acceso anónimo que requiera Apps Script, detenerse sin desplegar.
3. En una segunda terminal, asignar la ruta impresa en el paso anterior y servir la copia temporal:

```powershell
$qa = Read-Host "Pega la ruta de copia temporal QA impresa en la terminal anterior"
Set-Location $qa
python -m http.server 8123 --bind 127.0.0.1
```

4. Abrir `http://127.0.0.1:8123/`, introducir únicamente valores ficticios (por ejemplo, `QA Ficticia`, `2025550100`, `qa@example.test` y `MENSAJE FICTICIO DE PRUEBA`) y aceptar solo el consentimiento de QA autorizado. En Network, comprobar POST a `/exec`, respuesta JSON legible `ok:true` con ID válido y una sola fila nueva bajo los 12 encabezados. Verificar que la pestaña de WhatsApp solo muestra el saludo genérico y **no pulsar «Enviar»**.
5. Si la respuesta se bloquea por CORS/redirección, no cambiar el cliente a `no-cors`: registrar el fallo, mantener el endpoint de producción vacío y detener la activación. Al terminar, poner `REGISTRY_ENABLED=false` en el proyecto de prueba, retirar su deployment y eliminar únicamente la fila ficticia conforme a la autorización. Detener el servidor y borrar solo la ruta temporal `$qa`.

## Plan de QA de integración real

Estos casos aún no se ejecutaron contra Google. Usar proyecto/hoja de prueba, navegador de prueba, identidad ficticia y registrar evidencia sin PII.

| Caso | Preparación | Acción | Resultado esperado | Evidencia |
|---|---|---|---|---|
| Registro exitoso | QA habilitado, consentimiento/version de QA válidos, hoja vacía. | Enviar una consulta ficticia una vez. | Una fila; `ok:true`; ID único; estado `Nueva`; WhatsApp solo tras respuesta legible. | JSON de respuesta redactado, fila con identidad ficticia, captura de Network y estado de UI. |
| Datos incompletos | Mantener endpoint de prueba habilitado. | Omitir nombre/teléfono/email o usar formato inválido con POST manual; omitir área en un caso separado. | Datos de contacto incompletos producen `VALIDATION`; si falta área, se registra `No especificado`. | Respuesta, conteo de filas y ejecución sin PII. |
| Consentimiento no aceptado | Navegador de prueba sin marcar; además probar POST con `consentimiento:false`. | Enviar desde UI y desde cliente de prueba. | UI bloquea antes del POST; servidor rechaza la llamada manual; ninguna fila. | Captura UI/Network y JSON `VALIDATION`. |
| Honeypot activado | Endpoint de prueba habilitado. | Enviar `website` no vacío. | Rechazo genérico/`VALIDATION`; ninguna fila ni WhatsApp. | POST sintético, respuesta y conteo de filas. |
| Doble envío | Payload válido y clave única. | Enviar dos veces rápido y luego repetir la misma clave. | Cliente bloquea doble clic; servidor serializa y retorna mismo ID `duplicado:true`; una fila. | Solicitudes, dos respuestas y conteo de filas. |
| Reintento | Enviar payload válido y simular pérdida de respuesta después de escritura. | Reintentar el payload con la misma clave. | Se retorna ID ya creado, sin duplicar; si error antes de escritura, reintento puede crear una fila. | Clave redactada parcialmente, IDs, fila única y ejecución. |
| Timeout | Usar entorno de prueba controlado para retrasar/bloquear respuesta sin enviar a terceros. | Dejar vencer el timeout y reintentar con misma clave. | UI indica fallo y conserva datos; no abre WhatsApp hasta confirmación; reintento idempotente si ya escribió. | Estado UI, Network timeout, estado de fila y respuesta del reintento. |
| Error del servidor | En prueba, apagar `REGISTRY_ENABLED` o provocar error de configuración no destructivo. | Enviar payload ficticio. | Error explícito; ninguna falsa confirmación ni WhatsApp. | Respuesta `DISABLED`/`SERVER_ERROR`, UI y ejecución. |
| Respuesta malformada | Interponer mock controlado que devuelva HTML, JSON inválido o ID inválido. | Enviar desde formulario de prueba. | Cliente rechaza respuesta y no ofrece WhatsApp. | Cuerpo/status mock, consola y estado UI. |
| Fórmulas en Sheets | Enviar valores sintéticos que comiencen con `=`, `+`, `-`, `@`, espacios o controles antes del marcador. | Ejecutar POST válido de prueba. | Guardado como texto neutralizado, no como fórmula; revisar barra de fórmula. | Fila ficticia y captura de valor como texto; nunca introducir fórmulas destructivas. |
| No almacenar relato | Enviar `mensaje` sintético adicional en payload. | Registrar y revisar la fila y encabezados. | El backend ignora `mensaje`; ninguna columna contiene el relato. | Payload de QA ficticio, encabezados y fila revisada. |
| WhatsApp solo con confirmación | Mock/endpoint de prueba para éxito demorado y para rechazo/timeout. | Inspeccionar popup antes/después de la respuesta. | Antes de éxito no navega a WhatsApp; con éxito abre enlace con saludo genérico sin PII ni ID; con fallo cierra popup y conserva datos. | Grabación/capturas de estados y Network; no pulsar «Enviar». |
| CORS y redirect | Web App de prueba público, hosting HTTPS de prueba y navegador actual. | POST desde navegador con redirección seguida. | JavaScript puede leer JSON final; sin `no-cors`; ID válido. | Cadena de redirects, status, headers visibles, consola. Si bloqueado: release detenido. |

## Bloqueos y riesgos comprobados vs. pendientes

### Comprobado localmente

- Configuración apagada por defecto; no endpoint real, ID GA4, hoja ni credenciales en archivos inspeccionados.
- El backend crea un esquema fijo, bloquea durante búsqueda/escritura, busca idempotencia antes del límite y neutraliza entradas tipo fórmula.
- El cliente omite el mensaje libre del payload y valida ID antes de permitir WhatsApp.
- La atribución permanece apagada. Si Natalia/marketing aprueba activarla, la única nomenclatura admitida por el cliente y el servidor es el tuple exacto `google/cpc/search`; `gclid`, referente, términos y contenido UTM se descartan. No incluir nombres, teléfonos, correos ni texto libre en UTM.
- El límite por `CacheService` es best-effort, no CAPTCHA ni control por IP; puede ser desalojado y una persona puede variar identidad. El deployment anónimo permite abuso y consumo de cuotas.
- El servidor no añade encabezados CORS configurables en este diseño; Apps Script `ContentService` redirige. La lectura desde navegador no se puede certificar sin un Web App real. El comportamiento exacto de CORS/redirect, permisos de administrador y cuotas son pendientes de Google.
- La hoja y endpoint no tienen autenticación de usuario/origen en el diseño. El honeypot no es una barrera de seguridad.

### Decisiones requeridas de Natalia

- Aprobar texto de consentimiento y política aplicable; confirmar responsable, finalidad, canales de contacto y alcance.
- Definir plazo de conservación y procedimiento verificable de eliminación.
- Aprobar campos, uso de atribución, acceso a la hoja, buzón de notificación (si aplica) y exposición de un endpoint público.
- Autorizar la cuenta Google NMC, custodio, editores y responsable de operación.
- Decidir si se autoriza analítica GA4 y cualquier identificador real. No se ha inventado uno.

### Dependencias de Google

- Cuenta/administración NMC, creación de hojas y Apps Script, permisos de Sheets/Mail, opción de acceso anónimo disponible por políticas y cuotas.
- Despliegue de Web App y verificación real de JSON, redirect, CORS y operación de la hoja.
- No se verificaron estas dependencias en esta misión.

## Recuperación, revocación y rotación

### Ante fallo o timeout

1. Mantener el sitio desactivado o no modificar el endpoint mientras se investiga.
2. Revisar ejecuciones de Apps Script y la hoja usando permisos autorizados; no copiar datos personales a logs o tickets.
3. Un timeout puede ocurrir después de escribir. Antes de reintentar con otra clave, buscar la fila/ID; el formulario conserva la misma clave para reintento en la sesión. Si el usuario reabre una sesión y perdió la clave, verificar manualmente para evitar duplicados.
4. Corregir configuración/encabezados en el entorno de prueba y reproducir con datos ficticios. No eliminar ni editar registros reales como paso de diagnóstico.
5. Si Sheets no confirma el append, el cliente no abre WhatsApp. Indicar canal alternativo aprobado sin afirmar que hubo registro.

### Desactivar o revocar

1. Con acceso de titular, poner `REGISTRY_ENABLED=false` inmediatamente. La interfaz también debe quedar apagada: endpoint vacío y configuración frontend no habilitada en cualquier futuro release.
2. En `Implementar → Administrar implementaciones`, retirar/desactivar la implementación pública del entorno afectado. Confirmar que la URL antigua ya no acepta POST.
3. Revocar acceso de editores que ya no operen la hoja/proyecto; revisar usuarios, grupos y permisos compartidos. No hacer pública la hoja para “arreglar” acceso.
4. Si hay exposición sospechada, conservar evidencia técnica mínima sin payloads, detener la captación y acordar con Natalia el tratamiento de datos ya recogidos y las notificaciones que correspondan.

### Rotar endpoint

1. Crear y probar un nuevo deployment de prueba con hoja aislada.
2. Para producción, crear una nueva implementación desde el proyecto autorizado; guardar la nueva URL solo en el canal de configuración aprobado.
3. Verificar el nuevo endpoint con payload ficticio y el plan de pruebas aprobado.
4. Cambiar endpoint del sitio en el proceso normal de release autorizado; mantener endpoint vacío si todavía no hay consentimiento/QA.
5. Desactivar `REGISTRY_ENABLED` y retirar el deployment viejo; probar que la URL anterior falla. No dejar dos endpoints públicos habilitados sin necesidad.

La eliminación de filas reales debe seguir el plazo y procedimiento que Natalia apruebe; esta guía no fija uno.

## Acciones pendientes antes de producción

1. Natalia resuelve y documenta aprobaciones de consentimiento, finalidad, campos, conservación/eliminación y responsables.
2. NMC autoriza cuenta, custodio, operadores y permisos; confirma si acepta acceso público anónimo al Web App.
3. Juan López Studio ejecuta y evidencia el entorno aislado de prueba y toda la matriz de QA, en especial CORS/redirect desde navegador.
4. Resolver y documentar límites de abuso/cuotas con NMC; el rate limit actual es best-effort.
5. NMC crea hoja/proyecto de producción; registrar quién tiene acceso; mantener ambas compuertas desactivadas hasta el go-live autorizado.
6. Aprobación de lanzamiento por Natalia; configurar endpoint y consentimiento, desplegar el sitio mediante proceso autorizado y verificar monitoreo.
7. GA4 queda como decisión separada; no habilitar sin consentimiento/privacidad e ID real.
