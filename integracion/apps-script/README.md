# Apps Script: código de referencia

Este repositorio es público. Esta guía describe el código de referencia
versionado en [`Code.gs`](Code.gs); no contiene datos de despliegue ni demuestra
que ese código esté activo en una cuenta de Google.

## Contrato de alto nivel

- El cliente envía un POST HTTPS con JSON y espera una respuesta JSON con
  `ok: true` y un identificador de registro válido.
- El servidor valida consentimiento, versión, honeypot, campos de contacto y
  clave de idempotencia antes de escribir.
- La escritura espera una pestaña privada `Registro de consultas` con los 12
  encabezados y el orden definidos en `Code.gs`.
- El cliente no envía texto libre del caso. WhatsApp solo se ofrece después de
  una respuesta válida del servidor.
- Las propiedades de configuración se consultan en Apps Script; sus valores
  no se guardan en este repositorio.

La implementación tiene un endpoint público no autenticado por origen. Las
validaciones, el honeypot y el límite best-effort no sustituyen autenticación
ni garantizan protección contra abuso o consumo de cuotas.

## Límites de verificación

El código local no acredita permisos de Google, valores de Script Properties,
esquema real de la hoja, versión desplegada, cuotas, comportamiento de
redirección/CORS ni disponibilidad de producción. No ejecutar pruebas contra
una hoja o endpoint real sin autorización explícita y un entorno aislado.

Para instrucciones técnicas públicas, consulta
[Arquitectura](../../docs/ARQUITECTURA.md) y
[Seguridad y privacidad](../../docs/SEGURIDAD-Y-PRIVACIDAD.md). Los
procedimientos internos se conservan fuera del repositorio en
`documentacion/operativo/`.
