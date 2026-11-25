/*
 * Configuración del sitio N.M.C & Abogados.
 *
 * La configuración base mantiene las integraciones desactivadas.
 */
window.NMC_CONFIG = {
  whatsappNumber: "573146153979",

  // URL /exec del Web App de Apps Script. Vacío = registro desactivado.
  registryEndpoint: "",
  registryTimeoutMs: 12000,
  allowLocalRegistry: false,

  // Solo se cambia a true después de que Natalia apruebe el consentimiento.
  consentApproved: false,

  // Versión del texto de consentimiento aprobado por la abogada.
  // Vacío = el formulario NO registra ni envía datos.
  consentVersion: "",

  attribution: {
    // UTM permanece desactivado hasta aprobación de privacidad y marketing.
    enabled: false,
  },

  analytics: {
    // Requiere autorización técnica y consentimiento de analítica separado.
    enabled: false,
    consentGranted: false,
    ga4MeasurementId: "",
    adsConversionSendTo: "",
    debug: false,
  },
};
