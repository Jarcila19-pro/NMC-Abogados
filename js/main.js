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

// SMOOTH ANCHORS
document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener("click", (e) => {
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

// HERO PARALLAX
const heroImgEl = document.querySelector(".hero-right img");
window.addEventListener("scroll", () => {
  if (!reduceMotion && heroImgEl && window.scrollY < window.innerHeight) {
    heroImgEl.style.transform = `scale(1.06) translateY(${window.scrollY * 0.2}px)`;
  }
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
    var visObs = new IntersectionObserver(
      function (entries) {
        svcVisible = entries[0].isIntersecting;
      },
      { threshold: 0.05 },
    );
    visObs.observe(section);

    function animateParticles() {
      requestAnimationFrame(animateParticles);
      if (!svcVisible || reduceMotion) return;

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
    }
    animateParticles();
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