# Acta de cierre técnico documental

**Proyecto:** N.M.C & Abogados
**Fecha:** 27 de noviembre de 2026
**Alcance:** consolidación documental exclusivamente; sin cambios de aplicación,
servicios externos ni configuración remota.

## Estado de cierre

- Base inspeccionada: rama `main`, commit
  `3b4fc9a286bd731cd46340abd23e6da41535147a`, árbol limpio antes de iniciar.
- El trabajo se prepara en la rama independiente
  `docs/consolidacion-documental-nmc-2026-11`.
- Los cambios se limitan a documentación versionada y a documentación interna
  bajo `documentacion/`, excluida de Git. No se modifican HTML, CSS, JavaScript,
  `Code.gs`, workflows ni configuración de publicación.
- No se modifican GitHub Pages, DNS, Apps Script, Sheets ni propiedades.
- No se lanza `workflow_dispatch`, no se despliega Pages y no se envían
  formularios.
- Las pruebas de Google, CORS/redirect real, producción, permisos y DNS quedan
  fuera de esta intervención.

## Documentación consolidada

- Este README público funciona como punto de entrada.
- `docs/` contiene arquitectura, desarrollo/pruebas, publicación, seguridad y
  privacidad, hoja de ruta y esta acta.
- La guía de Apps Script versionada se sustituye por una referencia pública
  segura. Su contenido anterior se conserva íntegro en
  `documentacion/operativo/README-APPS-SCRIPT-ORIGINAL-2026-11-27.md`.
- `documentacion/` contiene el inventario inicial, el índice interno y una
  guía operativa privada. La carpeta y su contenido no forman parte del
  commit.
- Los documentos históricos preexistentes se conservan; su fecha y contenido
  no se consideran prueba del estado actual.

## Evidencia de validación local

- Suite unitaria local: **60/60 aprobadas** con datos sintéticos y mocks.
- Perfil `safe`: builder verificó **26 archivos** en una ruta temporal fuera del
  repositorio; la carpeta temporal se eliminó después.
- Referencias Markdown locales: no se encontraron rutas rotas en la
  documentación activa ni en el archivo histórico revisado.
- `git diff --cached --check`: sin errores de whitespace.
- No se ejecutaron pruebas de navegador, formularios reales, llamadas a Google,
  verificaciones de producción ni workflows de despliegue.

## Verificaciones pendientes

- Fuente remota de GitHub Pages, dominio, DNS y HTTPS.
- Reglas de protección de `main`, permisos del entorno y variables de Actions.
- Versión de Apps Script desplegada, Script Properties, permisos y esquema real
  de Sheets.
- Respaldos y restauración de la hoja; responsables, accesos, retención y
  eliminación de datos.
- Sincronización/transferencia de documentos privados a un destino autorizado.

El estado y la evidencia concretos de validación local quedan reflejados en el
historial de Git de esta rama. Esta acta no constituye aprobación para desplegar,
recopilar datos, habilitar analítica ni ejecutar operaciones en Google.
