# Hoja de ruta

Esta hoja separa oportunidades futuras de las tareas de cierre documental. No
autoriza ni implementa cambios de producción. Cada elemento requiere alcance,
responsable, aprobación y validación propios.

| Prioridad | Oportunidad | Beneficio esperado | Dependencias / criterio de inicio |
|---|---|---|---|
| P0 | Revisar permisos de GitHub, Google, Pages, Sheets y Apps Script. | Reducir exposición de datos y riesgo de cambios no autorizados. | Revisión con titulares de las cuentas; registrar solo resultados no sensibles. |
| P0 | Definir backups y probar recuperación aislada. | Recuperar consultas y configuración ante pérdida o error. | Aprobación de custodio, privacidad, ubicación, acceso y retención; probar con datos sintéticos. |
| P1 | Alertas de fallos de Apps Script y revisión de cuotas. | Detectar errores, interrupciones y abuso con rapidez. | Elegir canal aprobado que no incluya PII; evaluar el costo de ruido y límites de Google. |
| P1 | Monitoreo de disponibilidad del sitio y del flujo técnico sin escrituras. | Detectar páginas inaccesibles sin crear consultas reales. | Diseñar health-check que no envíe datos personales ni genere filas. |
| P1 | Controles adicionales contra abuso del endpoint. | Reducir spam y agotamiento de cuotas. | Análisis de amenaza y diseño compatible con un sitio estático; honeypot/cache actuales son best-effort. |
| P1 | Seguimiento comercial de consulta → contacto → cita. | Medir calidad y mejorar tiempos de respuesta. | Definir responsable, estados, acceso a Sheets y política de conservación. No inferir citas a partir de clics. |
| P2 | GA4 y conversiones de Google Ads. | Medir resultados de campañas y optimización autorizada. | Aprobación de privacidad/marketing, consentimiento aplicable, taxonomía de eventos, deduplicación y pruebas antes de habilitar. Actualmente apagados. |
| P2 | Mejoras de SEO y verificación de Search Console/Bing. | Mejorar indexación y capacidad de diagnóstico. | Confirmar propiedad y valores de verificación en el canal autorizado; revisar textos y datos estructurados con la titular. |
| P2 | Evolución del formulario y experiencia móvil/accesible. | Reducir abandono y hacer más clara la solicitud. | Validar con usuarios y titular; minimizar campos, no recolectar detalles sensibles ni relato innecesario. |

## Priorización

Los elementos P0 son condiciones operativas para gestionar datos y recuperar
servicios; P1 mejora confiabilidad y control de captación; P2 depende de
decisiones comerciales, privacidad y evidencia de uso. La prioridad no indica
que algo ya esté aprobado ni comprometido.
