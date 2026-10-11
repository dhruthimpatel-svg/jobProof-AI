/* ============================================================
   JobProof AI — Landing page behavior
   ============================================================ */

(function () {
  "use strict";

  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Background video ---------- */

  var video = document.querySelector(".bg-video");
  if (video) {
    if (reducedMotion) {
      video.pause();
    } else {
      var tryPlay = function () {
        var p = video.play();
        if (p && p.catch) p.catch(function () {});
      };
      tryPlay();
      // Autoplay policies: play on first interaction if it was blocked.
      ["pointerdown", "keydown", "touchstart"].forEach(function (evt) {
        document.addEventListener(evt, tryPlay, { once: true, passive: true });
      });
      // If the network video can't load at all, keep the calm dark backdrop.
      video.addEventListener("error", function () {
        video.style.display = "none";
      });
    }
  }

  /* ---------- Mobile menu ---------- */

  var burger = document.querySelector(".burger");
  var overlay = document.getElementById("menu-overlay");
  var menu = document.getElementById("mobile-menu");

  function setMenu(open) {
    if (!burger || !overlay || !menu) return;
    burger.classList.toggle("open", open);
    burger.setAttribute("aria-expanded", open ? "true" : "false");
    burger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    overlay.hidden = !open;
    menu.hidden = !open;
    document.body.classList.toggle("menu-open", open);
  }

  if (burger && overlay && menu) {
    burger.addEventListener("click", function () {
      setMenu(burger.getAttribute("aria-expanded") !== "true");
    });
    overlay.addEventListener("click", function () {
      setMenu(false);
    });
    menu.addEventListener("click", function (e) {
      if (e.target.closest("a")) setMenu(false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") setMenu(false);
    });
    window.addEventListener("resize", function () {
      if (window.innerWidth > 720) setMenu(false);
    });
  }

  /* ---------- Modals (How It Works / Features / About) ---------- */

  var MODAL_CONTENT = {
    how: {
      title: "How JobProof works",
      body: document.getElementById("how-content"),
    },
    features: {
      title: "What JobProof checks",
      body: (function () {
        var div = document.createElement("div");
        div.className = "modal-steps-wrap";
        div.innerHTML =
          '<ul class="modal-list">' +
          "<li><strong>Role Match Score</strong><span>How your evidence lines up with this job's requirements — weighted, with the math on request.</span></li>" +
          "<li><strong>ATS Analysis</strong><span>Headings, contact details, dates, structure, keyword coverage and formatting risks.</span></li>" +
          "<li><strong>Keyword Analysis</strong><span>Required and preferred keywords found and missing — each gap explained, never padded.</span></li>" +
          "<li><strong>Hiring Manager View</strong><span>What stands out in the first ten seconds, what gets skimmed, what raises concern.</span></li>" +
          "<li><strong>Role Benchmark</strong><span>Your evidence vs. what this role expects, with clear labels for requirements, inference and your input.</span></li>" +
          "<li><strong>Honest Rewrites</strong><span>Weak bullets rewritten from your own material only — accept, edit, or keep the original.</span></li>" +
          "</ul>";
        return div;
      })(),
    },
    about: {
      title: "About JobProof",
      body: (function () {
        var div = document.createElement("div");
        div.className = "modal-steps-wrap";
        div.innerHTML =
          '<div class="modal-prose">' +
          "<p>JobProof answers one question precisely: <strong>how strong is your application for this specific job, what is stopping it, and what exactly should you fix?</strong></p>" +
          "<p>It is evidence-based by design. Every claim in your analysis is traced to your resume or the job description — or clearly marked as an inference. When there isn't enough evidence, we say so instead of guessing.</p>" +
          "<p>Your resume is parsed in your browser and stays on your device. Delete it any time from Settings.</p>" +
          "</div>";
        return div;
      })(),
    },
  };

  var modalOverlay = document.getElementById("jp-modal-overlay");
  var modal = modalOverlay ? modalOverlay.querySelector(".modal") : null;
  var modalTitle = document.getElementById("jp-modal-title");
  var modalBody = document.getElementById("jp-modal-body");
  var lastFocused = null;

  function openModal(key) {
    var content = MODAL_CONTENT[key];
    if (!modalOverlay || !content || !content.body) return;
    lastFocused = document.activeElement;
    modalTitle.textContent = content.title;
    modalBody.innerHTML = "";
    var clone = content.body.cloneNode(true);
    clone.removeAttribute("hidden");
    modalBody.appendChild(clone);
    modalOverlay.hidden = false;
    document.body.classList.add("modal-open");
    var closeBtn = modal.querySelector(".modal-close");
    if (closeBtn) closeBtn.focus();
  }

  function closeModal() {
    if (!modalOverlay || modalOverlay.hidden) return;
    modalOverlay.hidden = true;
    document.body.classList.remove("modal-open");
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  document.addEventListener("click", function (e) {
    var trigger = e.target.closest("[data-modal]");
    if (trigger) {
      e.preventDefault();
      openModal(trigger.getAttribute("data-modal"));
      return;
    }
    if (e.target.closest("[data-modal-close]")) {
      closeModal();
      return;
    }
    if (modalOverlay && e.target === modalOverlay) closeModal();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeModal();
  });

  /* ---------- Coming soon (Sign In) ---------- */

  var soonOverlay = document.getElementById("soon-overlay");
  var soonMsg = document.getElementById("soon-msg");

  function showSoon(msg) {
    if (!soonOverlay || !soonMsg) return;
    soonMsg.textContent = msg;
    soonOverlay.hidden = false;
    clearTimeout(showSoon._t);
    showSoon._t = setTimeout(function () {
      soonOverlay.hidden = true;
    }, 2200);
  }

  document.addEventListener("click", function (e) {
    var soon = e.target.closest('[data-soon]');
    if (soon) {
      e.preventDefault();
      showSoon(soon.getAttribute("data-soon") || "Coming soon.");
    }
  });

  /* ---------- Nav helpers ---------- */

  document.querySelectorAll("[data-nav]").forEach(function (el) {
    el.addEventListener("click", function (e) {
      var key = el.getAttribute("data-nav");
      if (key === "home") {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
        return;
      }
      if (key === "signin") {
        e.preventDefault();
        setMenu(false);
        showSoon(el.getAttribute("data-soon") || "Accounts are coming soon — for now, everything works without one.");
        return;
      }
      if (key === "how" || key === "features" || key === "about") {
        e.preventDefault();
        setMenu(false);
        openModal(key);
      }
    });
  });
})();
