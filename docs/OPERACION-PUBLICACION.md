# Operación y publicación

## Qué publica cada servicio

- GitHub Pages sirve el frontend estático desde un artefacto creado por
  `scripts/build-public-site.mjs`.
- Apps Script ejecuta el backend independientemente. Cambiar `Code.gs` en Git
  no cambia su deployment; cambiar el frontend tampoco actualiza Script
  Properties ni la hoja.
- La rama contiene `CNAME` para `nmcabogada.com`. No se verificaron DNS,
  propiedad del dominio, ajustes remotos de Pages, emisión del certificado ni
  la opción «Enforce HTTPS».

## Workflow real

Archivo: `.github/workflows/pages.yml`.

1. Un Pull Request dirigido a `main` ejecuta las pruebas unitarias y construye
   el perfil `safe` fuera del repositorio. No configura Pages, no sube un
   artefacto y no ejecuta el job de despliegue.
2. `workflow_dispatch` ofrece los perfiles `safe` y `production`. El job de
   build requiere la rama `main` y `confirm_publication=true`.
3. El perfil `safe` construye con el endpoint vacío. El perfil `production`
   recibe `NMC_REGISTRY_ENDPOINT` desde la variable de repositorio
   `NMC_PRODUCTION_REGISTRY_ENDPOINT`; el builder valida el formato HTTPS de
   `/exec`, el consentimiento requerido y las compuertas apagadas.
4. **El job `deploy` solo comprueba que sea `workflow_dispatch`, que la rama
   sea `main` y que `confirm_publication=true`; no comprueba el perfil. Por
   tanto, ejecutar manualmente `safe` con confirmación también publica el
   artefacto seguro.** No usar esa opción como una validación de build sin
   publicación.
5. La publicación usa `actions/configure-pages`, `actions/upload-pages-artifact`
   y `actions/deploy-pages`. Un push o un PR no publica por sí solo.

No se ejecutó el workflow ni se cambió una configuración remota durante esta
misión. El workflow permite los dos perfiles; la rama y el consentimiento
requeridos no sustituyen la autorización del responsable de publicación.

## Procedimiento para una publicación autorizada

1. Revisar cambios, pruebas unitarias y resultado del builder en un Pull Request
   a `main`.
2. En GitHub Settings → Pages, confirmar que la fuente configurada sea
   GitHub Actions. La configuración actual no se ha consultado y no se presume.
3. Confirmar con el administrador el estado de permisos del entorno
   `github-pages`, los permisos de Actions y las reglas de protección de `main`.
   Las reglas de protección no se verificaron.
4. Confirmar el DNS y el dominio personalizado desde cuentas autorizadas;
   verificar el estado del certificado y HTTPS en GitHub Pages. No cambiar DNS
   ni configuración del dominio como parte de una revisión documental.
5. Para publicar el frontend de producción, quien tenga autorización debe
   iniciar `workflow_dispatch` en `main`, seleccionar `production` y confirmar
   explícitamente la publicación. Antes, comprobar que la variable de
   repositorio exista y corresponda al endpoint autorizado. No registrar su
   valor en commits, logs ni documentos.
6. Revisar el resultado del deployment y validar la página publicada mediante
   el procedimiento autorizado. No confundir la construcción local ni los
   tests de PR con esa verificación.

La URL del Web App es un endpoint público, no una credencial. No debe colocarse
en documentación pública, y el endpoint antiguo no queda revocado por cambiar
la variable de GitHub: la revocación del deployment corresponde a una acción
separada y autorizada en Google.

## GitHub Actions y permisos declarados

El workflow declara `contents: read` para el workflow y para `build`; el job
de despliegue solicita `pages: write` e `id-token: write` y usa el entorno
`github-pages`. La configuración de permisos de cuenta, usuarios, protección
de ramas, aprobaciones del entorno y variables de repositorio no se verifica
desde el YAML.

## Dominio, recuperación y cambios

`CNAME` y el registro de verificación de IndexNow están en el allowlist; no
eliminarlos sin una decisión y validación específicas. `robots.txt` orienta a
rastreadores, no es un control de acceso.

Si una publicación falla, conserva el run y el commit asociados, inspecciona
los logs de Actions sin copiar valores de configuración y detén nuevos intentos
hasta entender la causa. Una restauración del sitio debe pasar por revisión y
un nuevo deployment autorizado desde el estado de código acordado. La rama de
Git por sí sola no restaura el Web App, la hoja, DNS ni variables externas.

## Construcción local

Para build y comandos de validación seguros, consulta
[Desarrollo y pruebas](DESARROLLO-Y-PRUEBAS.md). La salida debe ser una carpeta
nueva fuera del repositorio. No ejecutes un build con perfil `production` ni
un `workflow_dispatch` para probar documentación.
