/*
 * Cliente del registro de consultas (Google Apps Script).
 * Solo considera exitoso un POST que devuelva JSON con ok:true e id.
 */
(function (global) {
  "use strict";

  function getConfig() {
    return global.NMC_CONFIG || {};
  }

  function endpoint() {
    return String(getConfig().registryEndpoint || "").trim();
  }

  function isConfigured() {
    return endpoint().length > 0;
  }

  function isSecure(url) {
    try {
      var parsed = new URL(url);
      if (
        parsed.protocol === "https:" &&
        parsed.hostname === "script.google.com" &&
        /^\/macros\/s\/[^/]+\/exec\/?$/.test(parsed.pathname) &&
        !parsed.search &&
        !parsed.hash
      ) {
        return true;
      }
      return (
        getConfig().allowLocalRegistry === true &&
        parsed.protocol === "http:" &&
        /^(127\.0\.0\.1|localhost)$/.test(parsed.hostname)
      );
    } catch (error) {
      return false;
    }
  }

  function registryError(code, message, outcome) {
    var error = new Error(message || code);
    error.code = code;
    error.outcome = outcome || "rejected";
    return error;
  }

  function isDefinitiveRejection(code) {
    return ["BAD_REQUEST", "DISABLED", "VALIDATION", "BUSY", "RATE_LIMITED"].indexOf(code) !== -1;
  }

  async function submit(payload) {
    var url = endpoint();
    if (!url) throw registryError("NOT_CONFIGURED", "El registro no está configurado.");
    if (!isSecure(url)) throw registryError("INSECURE_ENDPOINT", "El endpoint debe usar HTTPS.");

    var body = JSON.stringify(payload);
    if (body.length > 8000) {
      throw registryError("INVALID_REQUEST", "La solicitud excede el tamaño permitido.");
    }

    var timeout = Number(getConfig().registryTimeoutMs) || 12000;
    var controller = new AbortController();
    var timer = setTimeout(function () {
      controller.abort();
    }, timeout);

    var response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: body,
        redirect: "follow",
        signal: controller.signal,
        credentials: "omit",
      });
      if (!response.ok) {
        throw registryError(
          "HTTP_ERROR",
          "El registro respondió con un error HTTP " + response.status + ".",
          "uncertain",
        );
      }

      var text;
      try {
        text = await response.text();
      } catch (error) {
        if (error && error.name === "AbortError") throw error;
        throw registryError(
          "INVALID_RESPONSE",
          "No se pudo leer la respuesta del registro.",
          "uncertain",
        );
      }

      if (text.length > 20000) {
        throw registryError(
          "INVALID_RESPONSE",
          "La respuesta del registro es demasiado grande.",
          "uncertain",
        );
      }

      var data = JSON.parse(text);
      if (
        !data ||
        data.ok !== true ||
        typeof data.id !== "string" ||
        !/^NMC-[A-F0-9]{32}$/.test(data.id.trim())
      ) {
        var code = data && data.code ? String(data.code).slice(0, 60) : "REJECTED";
        var outcome =
          data &&
          data.ok === false &&
          isDefinitiveRejection(code)
            ? "rejected"
            : "uncertain";
        throw registryError(
          code,
          data && data.message
            ? String(data.message).slice(0, 300)
            : "El registro no confirmó la consulta.",
          outcome,
        );
      }

      return {
        ok: true,
        id: data.id.trim(),
        fecha: data.fecha || "",
        duplicado: data.duplicado === true,
      };
    } catch (error) {
      if (error && error.name === "AbortError") {
        throw registryError("TIMEOUT", "El registro tardó demasiado.", "uncertain");
      }
      if (error && error.code) throw error;
      if (response) {
        throw registryError(
          "INVALID_RESPONSE",
          "El registro devolvió una respuesta ilegible.",
          "uncertain",
        );
      }
      throw registryError("NETWORK", "No se pudo conectar con el registro.", "uncertain");
    } finally {
      clearTimeout(timer);
    }
  }

  global.NMCRegistry = {
    isConfigured: isConfigured,
    submit: submit,
  };
})(window);
