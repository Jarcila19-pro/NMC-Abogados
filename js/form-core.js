/*
 * Funciones puras del formulario de consulta.
 * Se cargan como script clásico y también se prueban en Node (ver pruebas/).
 */
(function (global) {
  "use strict";

  var LIMITS = {
    nombreMin: 2,
    nombreMax: 80,
    telefonoDigitosMin: 7,
    telefonoDigitosMax: 15,
    emailMax: 120,
    mensajeMin: 1,
    mensajeMax: 1500,
  };

  function stripControl(value) {
    return String(value == null ? "" : value)
      .replace(/\r\n?/g, "\n")
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  }

  function normalizeName(value) {
    return stripControl(value).replace(/\s+/g, " ").trim();
  }

  function normalizePhone(value) {
    return stripControl(value)
      .replace(/[^\d+\s().-]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function phoneDigits(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function normalizeMessage(value) {
    return stripControl(value)
      .split("\n")
      .map(function (line) {
        return line.replace(/[ \t]+$/g, "");
      })
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function truncate(value, max) {
    var chars = Array.from(String(value || ""));
    return chars.length > max ? chars.slice(0, max).join("") : chars.join("");
  }

  function isValidEmail(value) {
    var email = String(value || "").trim();
    if (!email || email.length > LIMITS.emailMax) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
  }

  function sanitize(values) {
    var source = values || {};
    return {
      nombre: truncate(normalizeName(source.nombre), LIMITS.nombreMax),
      telefono: truncate(normalizePhone(source.telefono), 20),
      email: truncate(String(source.email || "").trim().toLowerCase(), LIMITS.emailMax),
      mensaje: truncate(normalizeMessage(source.mensaje), LIMITS.mensajeMax),
      servicio: truncate(normalizeName(source.servicio), 60) || "No especificado",
      consentimiento: source.consentimiento === true,
    };
  }

  function validate(values, options) {
    var opts = options || {};
    var data = sanitize(values);
    var errors = {};
    var digits = phoneDigits(data.telefono);

    if (!data.nombre || Array.from(data.nombre).length < LIMITS.nombreMin) {
      errors.nombre = "Ingresa tu nombre (mínimo 2 caracteres).";
    } else if (!/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(data.nombre)) {
      errors.nombre = "Ingresa un nombre válido.";
    }

    if (!data.telefono || digits.length < LIMITS.telefonoDigitosMin || digits.length > LIMITS.telefonoDigitosMax) {
      errors.telefono = "Ingresa un teléfono válido con entre 7 y 15 dígitos.";
    }

    if (!isValidEmail(data.email)) {
      errors.email = "Ingresa un correo electrónico válido.";
    }

    if (!data.mensaje || Array.from(data.mensaje).length < LIMITS.mensajeMin) {
      errors.mensaje = "Escribe un mensaje.";
    }

    if (opts.requireConsent !== false && data.consentimiento !== true) {
      errors.consentimiento = "Debes autorizar el tratamiento de tus datos para continuar.";
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors: errors,
      data: data,
    };
  }

  function signature(values) {
    var data = sanitize(values);
    var text = [data.nombre, phoneDigits(data.telefono), data.email].join("|");
    var hash = 2166136261;
    for (var i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return "v1-" + (hash >>> 0).toString(16);
  }

  function makeIdempotencyKey() {
    try {
      if (global.crypto && typeof global.crypto.randomUUID === "function") {
        return "nmc-" + global.crypto.randomUUID();
      }
    } catch (error) {
      /* continúa con el respaldo */
    }
    var randomPart = "";
    for (var i = 0; i < 8; i++) {
      randomPart += Math.floor(Math.random() * 36).toString(36);
    }
    return "nmc-" + Date.now().toString(36) + "-" + randomPart;
  }

  function makeAnalyticsTransactionId() {
    var uuid = "";
    try {
      if (global.crypto && typeof global.crypto.randomUUID === "function") {
        uuid = global.crypto.randomUUID();
      }
    } catch (error) {
      /* continúa con el respaldo */
    }
    if (!uuid) {
      uuid =
        Date.now().toString(16).padStart(8, "0").slice(-8) +
        "-" +
        Math.random().toString(16).slice(2, 6).padEnd(4, "0") +
        "-4" +
        Math.random().toString(16).slice(2, 5).padEnd(3, "0") +
        "-a" +
        Math.random().toString(16).slice(2, 5).padEnd(3, "0") +
        "-" +
        Math.random().toString(16).slice(2, 14).padEnd(12, "0");
    }
    return "evt-" + uuid.toLowerCase();
  }

  function buildWhatsAppText() {
    return "Hola, quisiera solicitar información.";
  }

  function buildWhatsAppUrl(number) {
    var text = buildWhatsAppText();
    return "https://wa.me/" + (number || "573146153979") + "?" + new URLSearchParams({ text: text }).toString();
  }

  function buildPayload(values, meta) {
    var data = sanitize(values);
    var extra = meta || {};
    var utm = extra.utm || {};
    var attribution =
      String(utm.source || "").trim().toLowerCase() === "google" &&
      String(utm.medium || "").trim().toLowerCase() === "cpc" &&
      String(utm.campaign || "").trim().toLowerCase() === "search"
        ? { source: "google", medium: "cpc", campaign: "search" }
        : {};
    // El mensaje libre NO se envía al registro: solo viaja a WhatsApp después
    // de confirmar la fila. Así se evita almacenar detalles del caso.
    return {
      nombre: data.nombre,
      telefono: data.telefono,
      email: data.email,
      servicio: data.servicio,
      consentimiento: data.consentimiento === true,
      consentVersion: String(extra.consentVersion || "").trim(),
      utmSource: attribution.source || "",
      utmMedium: attribution.medium || "",
      utmCampaign: attribution.campaign || "",
      website: String(extra.website || "").slice(0, 200),
      claveIdempotencia: String(extra.key || ""),
    };
  }

  global.NMCFormCore = {
    LIMITS: LIMITS,
    sanitize: sanitize,
    validate: validate,
    phoneDigits: phoneDigits,
    normalizeMessage: normalizeMessage,
    isValidEmail: isValidEmail,
    signature: signature,
    makeIdempotencyKey: makeIdempotencyKey,
    makeAnalyticsTransactionId: makeAnalyticsTransactionId,
    buildWhatsAppText: buildWhatsAppText,
    buildWhatsAppUrl: buildWhatsAppUrl,
    buildPayload: buildPayload,
  };
})(typeof window !== "undefined" ? window : globalThis);
