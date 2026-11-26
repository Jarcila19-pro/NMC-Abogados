// LOADER
// Nota: la animación de entrada la controla el script inline en <head>/
// <body> de cada página (index.html y privacidad.html) — no duplicar aquí.

// MOVIMIENTO REDUCIDO (preferencia del usuario - WCAG 2.3.3)
const reduceMotion =
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// (Cursor personalizado eliminado: estaba sin estilos — era código muerto que
//  consumía un requestAnimationFrame infinito sin verse en pantalla.)

// NAV
window.addEventListener("scroll", () => {
  const nav = document.getElementById("nav");
  if (nav) {
    nav.classList.toggle("solid", window.scrollY > 40);
  }
});

// SCROLL REVEAL
const obs = new IntersectionObserver(
  (entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("in");
        obs.unobserve(e.target);
      }
    });
  },
  { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
);
document
  .querySelectorAll(".reveal,.reveal-left,.reveal-right,.blog-post")
  .forEach((el) => obs.observe(el));

// WHATSAPP WIDGET
const whatsappWidget = document.getElementById("whatsapp-widget");
if (whatsappWidget) {
  const toggleButton = whatsappWidget.querySelector(".whatsapp-widget-toggle");
  const panel = whatsappWidget.querySelector(".whatsapp-panel");
  const closeButton = whatsappWidget.querySelector(".whatsapp-panel-close");
  const chatLink = whatsappWidget.querySelector(".whatsapp-panel-link");
  const whatsappMessage = "Hola, quisiera agendar una consulta.";

  whatsappWidget.insertBefore(toggleButton, panel);
  chatLink.href = `https://wa.me/573146153979?${new URLSearchParams({
    text: whatsappMessage,
  }).toString()}`;

  function setWhatsAppWidgetOpen(isOpen, restoreFocus = false) {
    whatsappWidget.classList.toggle("is-open", isOpen);
    toggleButton.setAttribute("aria-expanded", String(isOpen));
    toggleButton.setAttribute(
      "aria-label",
      isOpen ? "Cerrar chat de WhatsApp" : "Abrir chat de WhatsApp",
    );
    panel.setAttribute("aria-hidden", String(!isOpen));

    if (!isOpen && restoreFocus) {
      toggleButton.focus();
    }
  }

  toggleButton.addEventListener("click", () => {
    setWhatsAppWidgetOpen(toggleButton.getAttribute("aria-expanded") !== "true");
  });
  closeButton.addEventListener("click", () => {
    setWhatsAppWidgetOpen(false, true);
  });
  document.addEventListener("click", (event) => {
    if (
      toggleButton.getAttribute("aria-expanded") === "true" &&
      !whatsappWidget.contains(event.target)
    ) {
      setWhatsAppWidgetOpen(false);
    }
  });
  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      toggleButton.getAttribute("aria-expanded") === "true"
    ) {
      setWhatsAppWidgetOpen(false, true);
    }
  });
}

// SMOOTH ANCHORS
document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener("click", (e) => {
    // El enlace de salto debe conservar el comportamiento nativo para mover el foco.
    if (a.classList.contains("skip-link")) return;
    const href = a.getAttribute("href");
    // Ignorar anclas vacías ("#") — querySelector("#") lanzaría un error
    if (!href || href.length < 2) return;
    const t = document.querySelector(href);
    if (t) {
      e.preventDefault();
      t.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
    }
  });
});

// MAGNETIC BUTTONS
if (!reduceMotion) {
  document.querySelectorAll(".btn-gold,.nav-cta").forEach((btn) => {
    btn.addEventListener("mousemove", (e) => {
      const r = btn.getBoundingClientRect();
      const x = e.clientX - r.left - r.width / 2;
      const y = e.clientY - r.top - r.height / 2;
      btn.style.transform = `translate(${x * 0.12}px,${y * 0.12}px)`;
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.transform = "";
    });
  });
}

// ═══════════════════════════════════════════
// NMC ABOGADOS — Services Section JS
// Requiere: #svcCanvas, #svcTop, .svc-card
// ═══════════════════════════════════════════

(function () {
  "use strict";

  // 1. Canvas: floating gold particles
  var canvas = document.getElementById("svcCanvas");
  var section = document.getElementById("services");

  if (canvas && section) {
    var ctx = canvas.getContext("2d");
    var W, H;

    function resizeCanvas() {
      W = canvas.width = section.offsetWidth;
      H = canvas.height = section.offsetHeight;
    }
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    function makeParticle(randomY) {
      return {
        x: Math.random() * W,
        y: randomY ? Math.random() * H : H + 8,
        r: Math.random() * 1.4 + 0.3,
        vy: Math.random() * 0.45 + 0.1,
        vx: (Math.random() - 0.5) * 0.25,
        a: Math.random() * 0.3 + 0.05,
      };
    }

    var particles = [];
    for (var i = 0; i < 70; i++) {
      particles.push(makeParticle(true));
    }
    if (reduceMotion) {
      canvas.style.display = "none"; // sin partículas con movimiento reducido
    }

    var svcVisible = false;
    var particleFrame = null;
    var visObs = new IntersectionObserver(
      function (entries) {
        svcVisible = entries[0].isIntersecting;
        updateParticleLoop();
      },
      { threshold: 0.05 },
    );
    visObs.observe(section);

    function updateParticleLoop() {
      if (svcVisible && !reduceMotion && !document.hidden) {
        if (particleFrame === null) {
          particleFrame = requestAnimationFrame(animateParticles);
        }
      } else if (particleFrame !== null) {
        cancelAnimationFrame(particleFrame);
        particleFrame = null;
      }
    }

    function animateParticles() {
      particleFrame = null;
      if (!svcVisible || reduceMotion || document.hidden) return;

      ctx.clearRect(0, 0, W, H);

      for (var j = 0; j < particles.length; j++) {
        var p = particles[j];
        p.y -= p.vy;
        p.x += p.vx;
        p.a -= 0.00025;

        if (p.y < -8 || p.a <= 0) {
          particles[j] = makeParticle(false);
          continue;
        }

        ctx.save();
        ctx.globalAlpha = Math.max(0, p.a);
        ctx.fillStyle = "#c99a2e";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      particleFrame = requestAnimationFrame(animateParticles);
    }

    document.addEventListener("visibilitychange", updateParticleLoop);
  }

  // 2. Scroll reveal — header + cards stagger
  var header = document.getElementById("svcTop");
  var cards = document.querySelectorAll(".svc-card");

  if (header || cards.length) {
    var revealObs = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;

          if (entry.target === header) {
            header.classList.add("in");
          } else {
            var idx = parseInt(
              entry.target.getAttribute("data-i") || "0",
              10,
            );
            setTimeout(
              function (card) {
                card.style.transition =
                  "opacity .85s cubic-bezier(.16,1,.3,1), transform .85s cubic-bezier(.16,1,.3,1), border-color .5s";
                card.classList.add("in");
              },
              idx * 130,
              entry.target,
            );
          }

          revealObs.unobserve(entry.target);
        });
      },
      { threshold: 0.12 },
    );

    if (header) revealObs.observe(header);
    cards.forEach(function (card) {
      revealObs.observe(card);
    });
  }

  // 3. 3D tilt on mouse (desactivado con movimiento reducido)
  if (!reduceMotion) {
    cards.forEach(function (card) {
      card.addEventListener("mouseenter", function () {
        card.style.transition = "transform .12s linear, border-color .5s";
      });

      card.addEventListener("mousemove", function (e) {
        var r = card.getBoundingClientRect();
        var x = ((e.clientX - r.left) / r.width - 0.5) * 10;
        var y = ((e.clientY - r.top) / r.height - 0.5) * 8;
        card.style.transform =
          "perspective(1000px) rotateY(" +
          x +
          "deg) rotateX(" +
          -y +
          "deg) scale3d(1.018,1.018,1.018)";
      });

      card.addEventListener("mouseleave", function () {
        card.style.transition =
          "transform .6s cubic-bezier(.4,0,.2,1), opacity .85s cubic-bezier(.16,1,.3,1), border-color .5s";
        card.style.transform =
          "perspective(1000px) rotateY(0deg) rotateX(0deg) scale3d(1,1,1)";
      });
    });
  }
})();

// Solo permite un why-row activo a la vez
document.addEventListener("DOMContentLoaded", function () {
  document.querySelectorAll(".why-row").forEach((row) => {
    row.addEventListener("click", () => {
      document
        .querySelectorAll(".why-row.active")
        .forEach((r) => r.classList.remove("active"));
      row.classList.add("active");
    });
  });
});

// MOBILE MENU TOGGLE
document.addEventListener("DOMContentLoaded", function () {
  const hamburger = document.querySelector(".hamburger");
  const mobileMenu = document.querySelector(".mobile-menu");
  const mobileOverlay = document.querySelector(".mobile-overlay");
  const mobileLinks = document.querySelectorAll(".mobile-nav-links a");
  const mobileCta = document.querySelector(".mobile-cta");
  if (!hamburger || !mobileMenu) return;

  function setExpanded(open) {
    hamburger.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function toggleMenu() {
    const open = !mobileMenu.classList.contains("active");
    hamburger.classList.toggle("active", open);
    mobileMenu.classList.toggle("active", open);
    if (mobileOverlay) mobileOverlay.classList.toggle("active", open);
    document.body.style.overflow = open ? "hidden" : "";
    setExpanded(open);
    if (open) {
      const first = mobileMenu.querySelector("a");
      if (first) first.focus();
    }
  }

  function closeMenu(refocus) {
    hamburger.classList.remove("active");
    mobileMenu.classList.remove("active");
    if (mobileOverlay) mobileOverlay.classList.remove("active");
    document.body.style.overflow = "";
    setExpanded(false);
    if (refocus) hamburger.focus();
  }

  hamburger.addEventListener("click", toggleMenu);

  if (mobileOverlay) {
    mobileOverlay.addEventListener("click", function () {
      closeMenu(true);
    });
  }

  mobileLinks.forEach((link) => {
    link.addEventListener("click", function () {
      closeMenu(false);
    });
  });

  if (mobileCta) {
    mobileCta.addEventListener("click", function () {
      closeMenu(false);
    });
  }

  /* Escape cierra el menú y devuelve el foco al botón */
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && mobileMenu.classList.contains("active")) {
      closeMenu(true);
    }
  });
});

// CONTACT FORM — registra la consulta y solo después ofrece WhatsApp.
const contactForm = document.getElementById("cf-whatsapp-form");
if (contactForm && whatsappWidget) {
  const formVisibilityObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      whatsappWidget.classList.toggle(
        "is-form-visible",
        entry.isIntersecting,
      );
    });
  });
  formVisibilityObserver.observe(contactForm);
}

if (contactForm) {
  const config = window.NMC_CONFIG || {};
  const core = window.NMCFormCore;
  const registry = window.NMCRegistry;
  const analytics = window.NMCAnalytics;
  const formStatus = contactForm.querySelector("#cf-form-status");
  const submitButton = contactForm.querySelector('button[type="submit"]');
  const consentInput = contactForm.querySelector("#cf-consent");
  const honeypot = contactForm.querySelector("#cf-website");
  const fields = {
    nombre: contactForm.querySelector("#cf-nombre"),
    telefono: contactForm.querySelector("#cf-telefono"),
    email: contactForm.querySelector("#cf-email"),
    servicio: contactForm.querySelector("#cf-servicio"),
    consentimiento: consentInput,
  };
  let submitting = false;
  let pendingRequest = null;

  function setStatus(message, link) {
    formStatus.replaceChildren(document.createTextNode(message));
    if (link) {
      const anchor = document.createElement("a");
      anchor.href = link.url;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      anchor.textContent = link.label;
      formStatus.append(document.createTextNode(" "), anchor);
    }
    formStatus.focus();
  }

  function clearErrors() {
    Object.values(fields).forEach((field) => {
      if (!field) return;
      field.setCustomValidity("");
      field.removeAttribute("aria-invalid");
    });
  }

  function markInvalid(name, message) {
    const field = fields[name];
    if (!field) return;
    field.setCustomValidity(message || "");
    field.setAttribute("aria-invalid", message ? "true" : "false");
  }

  function focusFirstError(errors) {
    const order = ["nombre", "telefono", "email", "servicio", "consentimiento"];
    const name = order.find((key) => errors[key]);
    if (name && fields[name]) fields[name].focus();
  }

  function readPendingKey(signature) {
    let serialized;
    try {
      serialized = sessionStorage.getItem("nmc_idem");
    } catch (error) {
      const storageError = new Error("No se pudo comprobar el estado de la solicitud.");
      storageError.code = "IDEMPOTENCY_UNAVAILABLE";
      throw storageError;
    }

    if (serialized) {
      let stored;
      try {
        stored = JSON.parse(serialized);
      } catch (error) {
        const storageError = new Error("El estado de reintento guardado no es válido.");
        storageError.code = "PENDING_REQUEST";
        storageError.outcome = "uncertain";
        throw storageError;
      }
      if (
        !stored ||
        typeof stored.sig !== "string" ||
        typeof stored.key !== "string" ||
        !stored.key
      ) {
        const storageError = new Error("El estado de reintento guardado no es válido.");
        storageError.code = "PENDING_REQUEST";
        storageError.outcome = "uncertain";
        throw storageError;
      }
      if (stored.sig !== signature) {
        const pendingError = new Error("Restaura los datos del intento pendiente antes de reintentar.");
        pendingError.code = "PENDING_REQUEST";
        pendingError.outcome = "uncertain";
        throw pendingError;
      }
      pendingRequest = stored;
      return stored.key;
    }

    if (pendingRequest) {
      if (pendingRequest.signature !== signature) {
        const pendingError = new Error("Restaura los datos del intento pendiente antes de reintentar.");
        pendingError.code = "PENDING_REQUEST";
        pendingError.outcome = "uncertain";
        throw pendingError;
      }
      return pendingRequest.key;
    }
    return null;
  }

  function savePendingKey(signature, key) {
    const stored = { sig: signature, key };
    try {
      sessionStorage.setItem("nmc_idem", JSON.stringify(stored));
      const verified = JSON.parse(sessionStorage.getItem("nmc_idem") || "null");
      if (!verified || verified.sig !== signature || verified.key !== key) {
        throw new Error("No se pudo verificar el estado guardado.");
      }
    } catch (error) {
      const storageError = new Error("No se pudo guardar una clave segura para reintentar.");
      storageError.code = "IDEMPOTENCY_UNAVAILABLE";
      throw storageError;
    }
    pendingRequest = { signature, key };
  }

  function clearPendingKey() {
    pendingRequest = null;
    try {
      sessionStorage.removeItem("nmc_idem");
      return true;
    } catch (error) {
      if (window.console && console.warn) {
        console.warn("[NMC] No se pudo limpiar la clave confirmada:", error && error.name);
      }
      return false;
    }
  }

  function errorMessage(error) {
    const code = error && error.code ? error.code : "UNKNOWN";
    if (error && error.outcome === "uncertain") {
      if (code === "PENDING_REQUEST") {
        return "Hay una solicitud pendiente de confirmación. Restaura los mismos datos y reintenta para evitar duplicados.";
      }
      return "No pudimos confirmar el resultado. Conservamos este intento; puedes reintentar sin cambiar los datos.";
    }
    if (code === "NOT_CONFIGURED") {
      return "El registro de consultas no está disponible en este momento. No se envió ningún dato.";
    }
    if (code === "INSECURE_ENDPOINT") {
      return "La configuración del registro no es segura. No se envió ningún dato.";
    }
    if (code === "IDEMPOTENCY_UNAVAILABLE") {
      return "No se pudo proteger la solicitud contra duplicados. No se envió ningún dato; inténtalo más tarde.";
    }
    if (code === "VALIDATION") {
      return "El registro no aceptó la solicitud. Revisa los datos e inténtalo nuevamente.";
    }
    if (code === "BUSY" || code === "RATE_LIMITED") {
      return "El registro está ocupado o recibió una solicitud reciente. Espera un momento antes de reintentar.";
    }
    if (code === "DISABLED") {
      return "El registro no está disponible en este momento. No se envió ningún dato.";
    }
    return "El registro rechazó la solicitud. Revisa los datos antes de volver a intentarlo.";
  }

  Object.values(fields).forEach((field) => {
    if (!field) return;
    const eventName =
      field.type === "checkbox" || field.tagName === "SELECT" ? "change" : "input";
    field.addEventListener(eventName, () => {
      field.setCustomValidity("");
      field.removeAttribute("aria-invalid");
    });
  });

  contactForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submitting) return;
    submitting = true;
    let recoveryPayload = null;
    let recoveryKey = null;

    formStatus.replaceChildren();
    clearErrors();
    try {
      if (honeypot && honeypot.value.trim()) {
        setStatus("No se pudo procesar la solicitud.");
        return;
      }

      const values = core.sanitize({
        nombre: fields.nombre.value,
        telefono: fields.telefono.value,
        email: fields.email.value,
        servicio: fields.servicio.value,
        consentimiento: consentInput.checked,
      });
      const validation = core.validate(values, { requireConsent: true });

      Object.keys(validation.errors).forEach((name) => {
        markInvalid(name, validation.errors[name]);
      });

      if (!validation.valid) {
        contactForm.reportValidity();
        focusFirstError(validation.errors);
        return;
      }

      if (
        !config.consentApproved ||
        !config.consentVersion ||
        !registry ||
        !registry.isConfigured()
      ) {
        setStatus(
          "El registro no está disponible en este momento. No se envió ningún dato.",
        );
        return;
      }

      submitButton.disabled = true;
      submitButton.textContent = "Enviando…";
      contactForm.setAttribute("aria-busy", "true");
      setStatus("Enviando tu solicitud de forma segura…");

      const requestMeta = {
        consentVersion: config.consentVersion,
        utm: analytics ? analytics.getUtm() : {},
        website: honeypot ? honeypot.value : "",
      };
      const signature = await core.signature(validation.data, requestMeta);
      const idempotencyKey =
        readPendingKey(signature) || core.makeIdempotencyKey();
      savePendingKey(signature, idempotencyKey);

      const payload = core.buildPayload(validation.data, {
        ...requestMeta,
        key: idempotencyKey,
      });
      recoveryPayload = payload;
      recoveryKey = idempotencyKey;

      const result = await registry.submit(payload);
      const whatsappUrl = core.buildWhatsAppUrl(config.whatsappNumber);

      if (analytics) {
        try {
          analytics.trackRegistrationConfirmed(core.makeAnalyticsTransactionId());
        } catch (error) {
          if (window.console && console.warn) {
            console.warn("[NMC] No se pudo registrar el evento de analítica:", error && error.name);
          }
        }
      }

      clearPendingKey();
      setStatus(
        `Solicitud registrada. Referencia ${result.id}. Puedes continuar por WhatsApp cuando estés listo:`,
        { url: whatsappUrl, label: "Continuar por WhatsApp" },
      );
    } catch (error) {
      const definitiveRejection =
        error &&
        error.outcome === "rejected" &&
        ["BAD_REQUEST", "DISABLED", "VALIDATION", "BUSY", "RATE_LIMITED"].includes(error.code);
      if (definitiveRejection) {
        clearPendingKey();
        if (window.console && console.warn) {
          console.warn("[NMC] Registro no confirmado:", error && error.code);
        }
        setStatus(errorMessage(error));
      } else if (
        error &&
        error.outcome === "uncertain" &&
        recoveryPayload &&
        recoveryKey &&
        !["PENDING_REQUEST", "IDEMPOTENCY_UNAVAILABLE", "NOT_CONFIGURED", "INSECURE_ENDPOINT", "INVALID_REQUEST"].includes(error.code)
      ) {
        setStatus("Verificando el registro antes de confirmar…");
        try {
          const recoveryResult = await registry.submit(recoveryPayload);
          const whatsappUrl = core.buildWhatsAppUrl(config.whatsappNumber);
          clearPendingKey();
          setStatus(
            `Solicitud registrada. Referencia ${recoveryResult.id}. Puedes continuar por WhatsApp cuando estés listo:`,
            { url: whatsappUrl, label: "Continuar por WhatsApp" },
          );
        } catch (recoveryError) {
          if (window.console && console.warn) {
            console.warn("[NMC] Recuperación no confirmada:", recoveryError && recoveryError.code);
          }
          setStatus(
            "No pudimos verificar el registro. Conservamos los datos para verificar el envío; no confirmamos el registro todavía.",
          );
        }
      } else {
        if (window.console && console.warn) {
          console.warn("[NMC] Registro no confirmado:", error && error.code);
        }
        setStatus(errorMessage(error));
      }
    } finally {
      submitting = false;
      submitButton.disabled = false;
      submitButton.textContent = "Enviar solicitud";
      contactForm.removeAttribute("aria-busy");
    }
  });
}
