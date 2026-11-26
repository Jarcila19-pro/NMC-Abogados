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
  };
  var SERVICIOS = ["Familia", "Civil", "Comercial", "Laboral", "No especificado"];

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
      servicio: truncate(normalizeName(source.servicio), 60),
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

    if (SERVICIOS.indexOf(data.servicio) === -1) {
      errors.servicio = "Selecciona un área de consulta válida.";
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

  function normalizeAttribution(utm) {
    var source = String((utm && utm.source) || "").trim().toLowerCase();
    var medium = String((utm && utm.medium) || "").trim().toLowerCase();
    var campaign = String((utm && utm.campaign) || "").trim().toLowerCase();
    return source === "google" && medium === "cpc" && campaign === "search"
      ? { source: source, medium: medium, campaign: campaign }
      : {};
  }

  async function signature(values, meta) {
    var source = values || {};
    var data = sanitize({
      nombre: source.nombre,
      telefono: source.telefono,
      email: source.email,
      servicio: source.servicio,
      consentimiento: source.consentimiento,
    });
    var extra = meta || {};
    var attribution = normalizeAttribution(extra.utm);
    var text = JSON.stringify([
      data.nombre,
      phoneDigits(data.telefono),
      data.email,
      data.servicio,
      data.consentimiento,
      String(extra.consentVersion || "").trim(),
      attribution.source || "",
      attribution.medium || "",
      attribution.campaign || "",
      String(extra.website || "").slice(0, 200),
    ]);

    if (
      !global.crypto ||
      !global.crypto.subtle ||
      typeof global.TextEncoder !== "function"
    ) {
      var error = new Error("No está disponible el cálculo seguro de la solicitud.");
      error.code = "IDEMPOTENCY_UNAVAILABLE";
      throw error;
    }

    var digest;
    try {
      digest = await global.crypto.subtle.digest(
        "SHA-256",
        new global.TextEncoder().encode(text),
      );
    } catch {
      var digestError = new Error("No se pudo calcular la huella segura de la solicitud.");
      digestError.code = "IDEMPOTENCY_UNAVAILABLE";
      throw digestError;
    }
    return (
      "sha256-" +
      Array.from(new Uint8Array(digest), function (byte) {
        return byte.toString(16).padStart(2, "0");
      }).join("")
    );
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
    var attribution = normalizeAttribution(extra.utm);
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
    isValidEmail: isValidEmail,
    signature: signature,
    makeIdempotencyKey: makeIdempotencyKey,
    makeAnalyticsTransactionId: makeAnalyticsTransactionId,
    buildWhatsAppText: buildWhatsAppText,
    buildWhatsAppUrl: buildWhatsAppUrl,
    buildPayload: buildPayload,
  };
})(typeof window !== "undefined" ? window : globalThis);
