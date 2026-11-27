# N.M.C & Abogados

Sitio web estático del estudio jurídico N.M.C & Abogados. Este repositorio es
público. La aplicación está construida con HTML, CSS y JavaScript sin framework
ni dependencias npm.

## Inicio rápido

- Node.js 20 o compatible para las pruebas unitarias y el constructor.
- Microsoft Edge y Python 3 solo para las pruebas de navegador opcionales.
- No existe `package.json`; no se requiere `npm install`.

Desde PowerShell, ejecuta las pruebas unitarias con los archivos explícitos:

```powershell
node --test pruebas\unit-analytics.mjs pruebas\unit-apps-script.mjs pruebas\unit-form.mjs pruebas\unit-publicacion.mjs pruebas\unit-registry.mjs pruebas\unit-servidor.mjs
```

Consulta [Desarrollo y pruebas](docs/DESARROLLO-Y-PRUEBAS.md) antes de generar
artefactos o ejecutar pruebas de navegador. Las pruebas de integración con
Google y cualquier envío real quedan fuera de las pruebas locales.

## Estructura

| Ruta | Responsabilidad |
|---|---|
| `index.html`, `privacidad.html`, `404.html` | Páginas del sitio y política publicada. |
| `css/` | Estilos del sitio y de la política. |
| `js/` | Configuración segura por defecto, formulario, transporte del registro y analítica desactivada. |
| `integracion/apps-script/Code.gs` | Código de referencia del backend Apps Script; no demuestra qué versión está desplegada. |
| `scripts/build-public-site.mjs` | Constructor y verificador del allowlist del artefacto público. |
| `.github/workflows/pages.yml` | Validación de PR y publicación manual desde `main`. |
| `pruebas/` | Unitarias y herramientas de navegador local. |
| `docs/` | Documentación técnica pública; no contiene credenciales. |
| `documentacion/` | Documentación interna local, ignorada por Git. No se incluye en el repositorio ni en el artefacto. |

La arquitectura y el recorrido de datos se describen en
[Arquitectura](docs/ARQUITECTURA.md). Las guías de
[publicación](docs/OPERACION-PUBLICACION.md) y
[seguridad y privacidad](docs/SEGURIDAD-Y-PRIVACIDAD.md) distinguen lo que
confirma el código de aquello que requiere verificación externa.

## Formulario y servicios externos

El formulario recoge nombre, teléfono, correo, área de consulta y autorización
expresa. El backend de referencia valida esos campos y escribe una fila en una
hoja de Google Sheets; el texto libre del caso no forma parte del payload. El
frontend solo ofrece continuar por WhatsApp después de recibir una confirmación
válida del registro. La configuración versionada en `js/config.js` deja el
endpoint y las integraciones desactivados.

GitHub Pages y Apps Script son servicios independientes. La presencia de
`Code.gs` en este repositorio no confirma que esté desplegado, que coincida con
la versión activa o que las Script Properties y la hoja estén configuradas.

## Publicación

Un Pull Request hacia `main` ejecuta pruebas unitarias y compila el perfil
`safe`; ese evento no publica. El workflow también admite ejecución manual en
`main`, con `confirm_publication=true` y perfil `safe` o `production`. **Ambos
perfiles manuales llegan al job de despliegue si se confirma la publicación**:
`safe` publica un artefacto sin registro habilitado y no es una validación sin
efectos. Usa `production` únicamente con autorización y configuración
verificadas. No se ha comprobado aquí la fuente configurada en GitHub Pages, el
estado HTTPS ni el DNS del dominio.

No ejecutar un despliegue como parte de una revisión documental. Antes de una
publicación autorizada, sigue el procedimiento en
[Operación y publicación](docs/OPERACION-PUBLICACION.md).

## Documentación

- [Arquitectura y estructura](docs/ARQUITECTURA.md)
- [Desarrollo y pruebas](docs/DESARROLLO-Y-PRUEBAS.md)
- [Operación y publicación](docs/OPERACION-PUBLICACION.md)
- [Seguridad y privacidad](docs/SEGURIDAD-Y-PRIVACIDAD.md)
- [Hoja de ruta](docs/HOJA-DE-RUTA.md)
- [Acta de cierre técnico](docs/ACTA-CIERRE-TECNICO.md)

La documentación privada permanece en `documentacion/` en el equipo de trabajo
y no queda respaldada por Git. Debe transferirse a un repositorio o espacio
privado aprobado por sus responsables antes de depender de ella para una
recuperación.
