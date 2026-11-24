/*
 * Eventos preparados para GA4 y Google Ads.
 * La carga externa requiere configuración y consentimiento independientes.
 */
(function (global) {
  "use strict";

  var STORAGE_KEY = "nmc_utm";
  var siteConfig = global.NMC_CONFIG || {};
  var config = siteConfig.analytics || {};
  var attributionEnabled = siteConfig.attribution && siteConfig.attribution.enabled === true;
  var started = false;
  var registeredTransactions = new Set();
  var ALLOWED_ATTRIBUTION = Object.freeze({
    source: "google",
    medium: "cpc",
    campaign: "search",
  });

  global.dataLayer = global.dataLayer || [];
  global.gtag =
    global.gtag ||
    function () {
      global.dataLayer.push(arguments);
    };

  function singleParam(params, key) {
    var values = params.getAll(key);
    return values.length === 1 ? values[0] : "";
  }

  function normalizeAttribution(values) {
    var normalized = {};
    Object.keys(ALLOWED_ATTRIBUTION).forEach(function (key) {
      var value = String((values && values[key]) || "")
        .trim()
        .toLowerCase();
      if (value === ALLOWED_ATTRIBUTION[key]) normalized[key] = value;
    });
    return Object.keys(normalized).length === 3 ? normalized : null;
  }

  function clearStoredUtm() {
    try {
      global.sessionStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      /* almacenamiento no disponible */
    }
  }

  function readUtmFromUrl() {
    var params = new URLSearchParams(global.location.search);
    var trackingParams = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "gclid",
    ];
    var hasTrackingParam = trackingParams.some(function (key) {
      return params.has(key);
    });

    if (!attributionEnabled) {
      clearStoredUtm();
      return;
    }
    if (!hasTrackingParam) return;

    var allowed = normalizeAttribution({
      source: singleParam(params, "utm_source"),
      medium: singleParam(params, "utm_medium"),
      campaign: singleParam(params, "utm_campaign"),
    });
    try {
      if (allowed) global.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(allowed));
      else clearStoredUtm();
    } catch (error) {
      /* almacenamiento no disponible */
    }
  }

  function getUtm() {
    if (!attributionEnabled) return {};
    var stored = {};
    try {
      stored = JSON.parse(global.sessionStorage.getItem(STORAGE_KEY) || "{}") || {};
    } catch (error) {
      stored = {};
    }
    return normalizeAttribution(stored) || {};
  }

  function doNotTrack() {
    return (
      global.navigator.doNotTrack === "1" ||
      global.navigator.msDoNotTrack === "1" ||
      global.doNotTrack === "1"
    );
  }

  function init() {
    if (started) return false;
    var id = String(config.ga4MeasurementId || "").trim();
    if (!config.enabled || !config.consentGranted || !/^G-[A-Z0-9]{4,20}$/.test(id)) {
      return false;
    }
    if (doNotTrack()) return false;

    started = true;
    var script = global.document.createElement("script");
    script.async = true;
    script.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(id);
    global.document.head.appendChild(script);

    global.gtag("js", new Date());
    global.gtag("config", id, {
      anonymize_ip: true,
      send_page_view: false,
    });
    return true;
  }

  function emit(name, params) {
    var payload = Object.assign(
      {
        event: name,
        pagina: global.location.pathname,
      },
      params || {},
    );
    global.dataLayer.push(payload);
    if (started && typeof global.gtag === "function") {
      global.gtag("event", name, params || {});
    }
    if (config.debug && global.console) {
      global.console.info("[NMC analytics]", name, params || {});
    }
  }

  function handleWhatsAppClick(event) {
    if (!event || event.isTrusted !== true) return;
    var link =
      event.target && event.target.closest
        ? event.target.closest("a[href]")
        : null;
    if (!link) return;
    try {
      var url = new URL(link.href, global.location.href);
      if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "wa.me") return;
    } catch (error) {
      return;
    }

    var location =
      link.getAttribute("data-analytics-location") || "enlace_whatsapp";
    if (!/^[a-z0-9_-]{1,40}$/.test(location)) location = "enlace_whatsapp";
    emit("whatsapp_click", { ubicacion: location });
  }

  function trackRegistrationConfirmed(transactionId) {
    var id = String(transactionId || "");
    if (
      !/^evt-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        id,
      )
    ) {
      return false;
    }
    if (registeredTransactions.has(id)) return false;
    registeredTransactions.add(id);

    emit("consulta_registrada", { transaction_id: id });
    if (config.adsConversionSendTo && started) {
      global.gtag("event", "conversion", {
        send_to: config.adsConversionSendTo,
        transaction_id: id,
      });
    }
    return true;
  }

  global.document.addEventListener("click", handleWhatsAppClick);
  readUtmFromUrl();

  global.NMCAnalytics = {
    init: init,
    trackRegistrationConfirmed: trackRegistrationConfirmed,
    getUtm: getUtm,
    isEnabled: function () {
      return started;
    },
  };

  init();
})(window);
