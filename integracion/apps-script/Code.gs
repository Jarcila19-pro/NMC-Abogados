/**
 * N.M.C & Abogados — Registro de consultas (Google Apps Script)
 *
 * Recibe un POST JSON desde el sitio, valida en servidor y agrega UNA fila a
 * una hoja privada. Solo devuelve { ok:true, id } cuando la escritura se
 * completó. No recibe ni almacena el mensaje libre del caso: ese texto viaja
 * únicamente a WhatsApp cuando la persona lo envía.
 *
 * Implementación de referencia. Requiere despliegue y verificación reales bajo
 * una cuenta de NMC & Abogados antes de activarse en producción. Ver README.md.
 */

var SHEET_NAME = 'Registro de consultas';
var RATE_LIMIT_SECONDS = 60;
var EXPECTED_HEADERS = [
  'ID',
  'Fecha de recepción',
  'Nombre',
  'Teléfono',
  'Correo',
  'Área de consulta',
  'Estado',
  'Fecha de seguimiento',
  'Responsable',
  'Fuente',
  'Idempotencia',
  'Versión de consentimiento'
];

var SERVICIOS = [
  'Civil',
  'Comercial',
  'Familia',
  'Laboral',
  'No especificado'
];

var LIMITS = {
  nombreMin: 2,
  nombreMax: 80,
  emailMax: 120,
  telefonoDigitosMin: 7,
  telefonoDigitosMax: 15,
  areaMax: 60,
  fuenteMax: 120,
  idempotenciaMax: 100,
  consentVersionMax: 40
};

function doPost(e) {
  try {
    var payload = parsePayload_(e);
    if (!payload) return respond_({ ok: false, code: 'BAD_REQUEST', message: 'Solicitud invalida.' });

    var settings = getSettings_();
    if (!settings.enabled || !settings.consentApproved) {
      return respond_({ ok: false, code: 'DISABLED', message: 'El registro no esta habilitado.' });
    }

    var error = validate_(payload, settings);
    if (error) return respond_({ ok: false, code: 'VALIDATION', message: error });

    var source = buildSource_(payload);
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) {
      return respond_({ ok: false, code: 'BUSY', message: 'El registro esta ocupado. Reintenta.' });
    }

    try {
      var sheet = getSheet_();
      var existing = findByIdempotency_(sheet, payload.claveIdempotencia);
      if (existing) {
        return respond_({
          ok: true,
          id: existing.id,
          fecha: existing.fecha,
          duplicado: true
        });
      }

      var cache = CacheService.getScriptCache();
      var rateKey = rateLimitKey_(payload);
      if (cache.get(rateKey)) {
        return respond_({
          ok: false,
          code: 'RATE_LIMITED',
          message: 'Espera un momento antes de enviar otra consulta.'
        });
      }

      var id = 'NMC-' + Utilities.getUuid().replace(/-/g, '').toUpperCase();
      var now = new Date();
      appendRecord_(sheet, {
        'ID': id,
        'Fecha de recepción': now,
        'Nombre': safeText_(text_(payload.nombre, LIMITS.nombreMax)),
        'Teléfono': safeText_(text_(payload.telefono, 30)),
        'Correo': safeText_(text_(payload.email, LIMITS.emailMax).toLowerCase()),
        'Área de consulta': safeText_(text_(payload.servicio || 'No especificado', LIMITS.areaMax)),
        'Estado': 'Nueva',
        'Fecha de seguimiento': '',
        'Responsable': '',
        'Fuente': safeText_(source),
        'Idempotencia': safeText_(text_(payload.claveIdempotencia, LIMITS.idempotenciaMax)),
        'Versión de consentimiento': safeText_(text_(payload.consentVersion, LIMITS.consentVersionMax))
      });
      SpreadsheetApp.flush();
      try {
        cache.put(rateKey, id, RATE_LIMIT_SECONDS);
      } catch (cacheError) {
        logError_('No se pudo actualizar el limite de solicitudes', cacheError);
      }

      if (settings.notifyEmail) {
        try {
          notify_(settings.notifyEmail, id);
        } catch (mailError) {
          logError_('No se pudo enviar la notificacion', mailError);
        }
      }

      return respond_({ ok: true, id: id, fecha: now.toISOString() });
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    // Nunca devolver trazas ni detalles internos al navegador.
    logError_('Fallo al registrar consulta', error);
    return respond_({ ok: false, code: 'SERVER_ERROR', message: 'No se pudo completar el registro.' });
  }
}

function parsePayload_(e) {
  if (!e || !e.postData || !e.postData.contents) return null;
  var text = String(e.postData.contents);
  if (text.length > 8000) return null;
  try {
    var data = JSON.parse(text);
    return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
  } catch (error) {
    return null;
  }
}

function validate_(payload, settings) {
  if (payload.website) return 'Solicitud no valida.';

  if (payload.consentimiento !== true) return 'Falta la autorizacion de tratamiento de datos.';

  if (raw_(payload.consentVersion).length > LIMITS.consentVersionMax) {
    return 'La version del consentimiento no es valida.';
  }
  var consentVersion = text_(payload.consentVersion, LIMITS.consentVersionMax);
  if (!consentVersion || consentVersion !== settings.consentVersion) {
    return 'La version del consentimiento no es valida.';
  }

  if (raw_(payload.nombre).length > LIMITS.nombreMax) return 'El nombre no es valido.';
  var nombre = text_(payload.nombre, LIMITS.nombreMax);
  if (nombre.length < LIMITS.nombreMin) return 'El nombre no es valido.';
  if (!/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(nombre)) return 'El nombre no es valido.';

  if (raw_(payload.telefono).length > 30) return 'El telefono no es valido.';
  var telefono = text_(payload.telefono, 30);
  if (!/^\+?[0-9][0-9\s().-]*$/.test(telefono)) return 'El telefono no es valido.';
  var digits = phoneDigits_(telefono);
  if (digits.length < LIMITS.telefonoDigitosMin || digits.length > LIMITS.telefonoDigitosMax) {
    return 'El telefono no es valido.';
  }

  if (raw_(payload.email).length > LIMITS.emailMax) return 'El correo no es valido.';
  var email = text_(payload.email, LIMITS.emailMax).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return 'El correo no es valido.';

  if (raw_(payload.servicio).length > LIMITS.areaMax) return 'El area de consulta no es valida.';
  var servicio = text_(payload.servicio || 'No especificado', LIMITS.areaMax);
  if (SERVICIOS.indexOf(servicio) === -1) return 'El area de consulta no es valida.';

  if (raw_(payload.claveIdempotencia).length > LIMITS.idempotenciaMax) {
    return 'La clave de solicitud no es valida.';
  }
  var key = text_(payload.claveIdempotencia, LIMITS.idempotenciaMax);
  var clientKeyPattern = /^nmc-(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|[0-9a-z]+-[0-9a-z]{8})$/;
  if (!key || !clientKeyPattern.test(key)) return 'La clave de solicitud no es valida.';

  return '';
}

function raw_(value) {
  return String(value == null ? '' : value);
}

function text_(value, max) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function phoneDigits_(value) {
  return String(value == null ? '' : value).replace(/\D/g, '');
}

/** Evita que Sheets interprete la entrada como formula. */
function safeText_(value) {
  var text = String(value == null ? '' : value);
  return /^(?:[\s]*[=+\-@]|[\t\r])/.test(text) ? "'" + text : text;
}

function rateLimitKey_(payload) {
  var identity = text_(payload.email, LIMITS.emailMax).toLowerCase() +
    '|' + phoneDigits_(payload.telefono);
  var digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    identity,
    Utilities.Charset.UTF_8
  );
  var hex = digest.map(function (byte) {
    return ('0' + (byte & 255).toString(16)).slice(-2);
  }).join('');
  return 'nmc-rate-' + hex;
}

function buildSource_(payload) {
  var source = allowedAttributionValue_(payload.utmSource, 'google', 20);
  var medium = allowedAttributionValue_(payload.utmMedium, 'cpc', 20);
  var campaign = allowedAttributionValue_(payload.utmCampaign, 'search', 40);
  if (source && medium && campaign) {
    return 'source=google | medium=cpc | campaign=search';
  }
  return 'Sin atribucion';
}

function allowedAttributionValue_(value, expected, max) {
  if (raw_(value).length > max) return false;
  var normalized = text_(value, max).toLowerCase();
  return /^[a-z0-9_-]+$/.test(normalized) && normalized === expected;
}

function getSettings_() {
  var props = PropertiesService.getScriptProperties();
  return {
    enabled: String(props.getProperty('REGISTRY_ENABLED') || 'false') === 'true',
    consentApproved: String(props.getProperty('CONSENT_APPROVED') || 'false') === 'true',
    consentVersion: String(props.getProperty('CONSENT_VERSION') || '').trim(),
    notifyEmail: String(props.getProperty('NOTIFY_EMAIL') || '').trim()
  };
}

function getSheet_() {
  var props = PropertiesService.getScriptProperties();
  var spreadsheetId = String(props.getProperty('SPREADSHEET_ID') || '').trim();
  if (!spreadsheetId) throw new Error('Falta SPREADSHEET_ID');

  var spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  var sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('No existe la pestaña requerida: ' + SHEET_NAME);
  getHeaders_(sheet);
  return sheet;
}

function getHeaders_(sheet) {
  if (sheet.getLastColumn() !== EXPECTED_HEADERS.length) {
    throw new Error('La hoja debe contener exactamente los 12 encabezados esperados.');
  }
  var headers = sheet.getRange(1, 1, 1, EXPECTED_HEADERS.length).getDisplayValues()[0];
  if (
    headers.length !== EXPECTED_HEADERS.length ||
    EXPECTED_HEADERS.some(function (expected, index) {
      return headers[index] !== expected;
    })
  ) {
    throw new Error('La estructura de la hoja no coincide con los encabezados esperados.');
  }
  return headers;
}

function headerIndex_(headers, name) {
  var index = headers.indexOf(name);
  if (index < 0) throw new Error('Falta el encabezado requerido: ' + name);
  return index + 1;
}

function appendRecord_(sheet, record) {
  var headers = getHeaders_(sheet);
  var values = headers.map(function (header) {
    if (!Object.prototype.hasOwnProperty.call(record, header)) {
      throw new Error('Falta un valor de registro para el encabezado: ' + header);
    }
    return record[header];
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, headers.length).setValues([values]);
}

function findByIdempotency_(sheet, key) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  var headers = getHeaders_(sheet);
  var column = headerIndex_(headers, 'Idempotencia');
  var match = sheet
    .getRange(2, column, lastRow - 1, 1)
    .createTextFinder(key)
    .matchEntireCell(true)
    .findNext();
  if (!match) return null;
  var row = match.getRow();
  return {
    id: String(sheet.getRange(row, headerIndex_(headers, 'ID')).getDisplayValue()),
    fecha: sheet.getRange(row, headerIndex_(headers, 'Fecha de recepción')).getDisplayValue()
  };
}

function notify_(email, id) {
  MailApp.sendEmail({
    to: email,
    subject: 'Nueva consulta registrada ' + id,
    body:
      'Se registro una nueva consulta en la hoja privada.\n' +
      'Identificador: ' + id + '\n' +
      'Ingresa a Google Sheets para revisar los datos y el estado.'
  });
}

function respond_(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function logError_(context, error) {
  var name = error && error.name ? String(error.name) : 'Error';
  var message = '[NMC] ' + context + ' (' + name + ')';
  if (typeof console !== 'undefined' && console && typeof console.error === 'function') {
    console.error(message);
  } else if (typeof Logger !== 'undefined' && Logger && typeof Logger.log === 'function') {
    Logger.log(message);
  }
}

/** 
 * Prepara exclusivamente la pestaña existente autorizada.
 * Puede renombrar "Hoja 1" y configurar los encabezados exactos; no crea otro
 * spreadsheet, no cambia el título del documento y no modifica registros.
 */
function setupSheet() {
  var props = PropertiesService.getScriptProperties();
  var spreadsheetId = String(props.getProperty('SPREADSHEET_ID') || '').trim();
  if (!spreadsheetId) throw new Error('Falta SPREADSHEET_ID');

  var spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  var sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.getSheetByName('Hoja 1');
    if (!sheet) {
      throw new Error('No existe la pestaña requerida "Registro de consultas" ni "Hoja 1".');
    }
  }

  if (sheet.getLastRow() > 1) {
    throw new Error('La hoja contiene registros. setupSheet() no puede sobrescribirlos.');
  }

  if (sheet.getName() !== SHEET_NAME) {
    sheet.setName(SHEET_NAME);
  }

  sheet.getRange(1, 1, 1, EXPECTED_HEADERS.length).setValues([EXPECTED_HEADERS]);
  sheet.getRange(1, 1, 1, EXPECTED_HEADERS.length)
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setWrap(true);
  sheet.setRowHeight(1, 38);
  sheet.setFrozenRows(1);

  SpreadsheetApp.flush();
  getHeaders_(sheet);
  return 'Esquema configurado y validado: ' + sheet.getName();
}
