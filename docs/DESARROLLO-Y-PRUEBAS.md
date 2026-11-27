# Desarrollo y pruebas

## Requisitos

- Node.js 20, igual que el runtime configurado en GitHub Actions. No se
  necesitan paquetes npm ni existe manifiesto `package.json`.
- Python 3 y Microsoft Edge instalados solo para servir el sitio y ejecutar los
  harnesses de navegador opcionales.
- PowerShell para los ejemplos siguientes.

## Pruebas unitarias

Ejecuta desde la raíz del repositorio:

```powershell
node --test pruebas\unit-analytics.mjs pruebas\unit-apps-script.mjs pruebas\unit-form.mjs pruebas\unit-publicacion.mjs pruebas\unit-registry.mjs pruebas\unit-servidor.mjs
```

Las pruebas de Apps Script y Sheets usan dobles/mocks locales; no se conectan a
Google ni crean filas reales. La suite de publicación crea directorios
temporales locales y los limpia. El workflow de PR ejecuta
`node --test pruebas/unit-*.mjs` en Ubuntu, donde el shell expande el patrón.

## Construir el artefacto de perfil seguro

Usa una ruta nueva fuera del repositorio. El builder falla si el destino ya
existe.

```powershell
$out = Join-Path $env:TEMP ("nmc-public-" + [guid]::NewGuid().ToString("N"))
node scripts\build-public-site.mjs --profile safe --out $out
if ($LASTEXITCODE -ne 0) { throw "Falló la construcción o validación del artefacto" }
Get-ChildItem -LiteralPath $out -Recurse -File | ForEach-Object {
  $_.FullName.Substring($out.Length + 1)
}
```

`safe` deja vacío el endpoint y las compuertas de consentimiento/analítica
apagadas. El artefacto contiene exclusivamente los archivos en
`PUBLIC_FILES`; la documentación pública del repositorio no se incluye en
Pages. El builder no modifica fuentes.

## Pruebas de navegador locales (opcionales)

Las pruebas `pruebas/smoke.mjs`, `pruebas/formulario.mjs` y
`pruebas/visual.mjs` usan Microsoft Edge vía CDP. Sirve un artefacto local
seguro en vez de apuntar a producción:

1. Construye el perfil `safe` en una carpeta temporal nueva.
2. En la misma terminal donde definiste `$out`, entra a esa carpeta y ejecuta:

   ```powershell
   Set-Location $out
   python -m http.server 8123 --bind 127.0.0.1
   ```

3. En otra terminal desde la raíz del repositorio, usa una carpeta de salida
   nueva fuera del árbol para preservar `pruebas/salidas/`:

   ```powershell
   $qa = Join-Path $env:TEMP ("nmc-qa-" + [guid]::NewGuid().ToString("N"))
   New-Item -ItemType Directory -Path $qa | Out-Null
   $env:NMC_URL = "http://127.0.0.1:8123/"
   $env:NMC_OUTPUT_DIR = $qa
   node pruebas\smoke.mjs
   if ($LASTEXITCODE -ne 0) { throw "Falló smoke" }
   node pruebas\formulario.mjs
   if ($LASTEXITCODE -ne 0) { throw "Falló formulario" }
   node pruebas\visual.mjs
   if ($LASTEXITCODE -ne 0) { throw "Falló visual" }
   ```

4. Al terminar, detén el servidor con `Ctrl+C`. Elimina solo las carpetas
   temporales exactas que acabas de crear, si ya no las necesitas.

Estas pruebas son locales/simuladas. No sustituyen pruebas autorizadas de
integración con Apps Script, Sheets, CORS o la web publicada. No configures un
endpoint real en `config-qa.local.js` ni uses datos de clientes en el harness.
No se ejecutaron pruebas de navegador durante esta consolidación.

## Criterios de validación

- Revisa los errores y el código de salida; no interpretes una prueba mock como
  una comprobación de Google o producción.
- No subas capturas, salidas ni datos sintéticos a un repositorio público si
  contienen rutas locales o configuración.
- No ejecutes `setupSheet()` ni el ejemplo de envío manual contra producción.
- Para publicación, sigue la guía de [Operación y publicación](OPERACION-PUBLICACION.md).
