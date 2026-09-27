/* ============================================================
   JobProof AI — js/app.js
   Application controller: view routing, resume upload, job
   input, analysis run, settings, modals, toast. Rendering of
   results lives in results.js.
   ============================================================ */

(function () {
  "use strict";

  var JP = window.JP;
  var U = JP.util;
  var store = JP.store;
  var $ = function (id) { return document.getElementById(id); };

  var currentView = "home";

  /* ================= tiny helpers ================= */

  function show(el) { if (el) el.hidden = false; }
  function hide(el) { if (el) el.hidden = true; }

  var toastTimer = null;
  function toast(msg) {
    var t = $("toast");
    t.textContent = msg;
    show(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { hide(t); }, 3200);
  }

  function userMessage(err) {
    return (err && err.userMessage) || "Something went wrong. Please try again.";
  }

  /* ================= Confirm modal ================= */

  var confirmCb = null;

  function openConfirm(title, text, okLabel, cb) {
    $("confirm-title").textContent = title;
    $("confirm-text").textContent = text;
    $("confirm-ok").textContent = okLabel;
    confirmCb = cb;
    show($("confirm-overlay"));
    $("confirm-ok").focus();
  }

  function closeConfirm() {
    hide($("confirm-overlay"));
    confirmCb = null;
  }

  /* ================= Edit modal ================= */

  var editCb = null;

  JP.ui = {
    openEditModal: function (initial, cb) {
      $("edit-textarea").value = initial || "";
      editCb = cb;
      show($("edit-overlay"));
      var ta = $("edit-textarea");
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    },
    toast: toast,
  };

  function closeEdit() {
    hide($("edit-overlay"));
    editCb = null;
  }

  /* ================= View routing ================= */

  function showView(name) {
    currentView = name;
    document.querySelectorAll(".view").forEach(function (v) {
      var active = v.dataset.view === name;
      v.classList.toggle("is-active", active);
      if (active) show(v); else hide(v);
    });
    document.querySelectorAll(".nav-item").forEach(function (n) {
      var active = n.dataset.view === name;
      n.classList.toggle("is-active", active);
      if (active) n.setAttribute("aria-current", "page");
      else n.removeAttribute("aria-current");
    });
    document.querySelector(".app-layout").classList.remove("nav-open");
    $("sidebar-toggle").setAttribute("aria-expanded", "false");
    window.scrollTo(0, 0);
  }

  function bindNav() {
    document.querySelectorAll(".nav-item").forEach(function (n) {
      n.addEventListener("click", function (e) {
        e.preventDefault();
        showView(n.dataset.view);
        if (n.dataset.view === "resume") renderResumeScreen();
        if (n.dataset.view === "career" && window.JP.career) window.JP.career.render();
        if (n.dataset.view === "applications" && window.JP.applications) window.JP.applications.render();
        if (n.dataset.view === "proof" && window.JP.proof) window.JP.proof.render();
        if (n.dataset.view === "activity" && window.JP.career) window.JP.career.renderActivity();
        if (n.dataset.view === "target" && window.JP.company) window.JP.company.render();
      });
    });

    var actLink = $("nav-activity");
    if (actLink) {
      actLink.addEventListener("click", function (e) {
        e.preventDefault();
        showView("activity");
        if (window.JP.career) window.JP.career.renderActivity();
      });
    }

    $("sidebar-toggle").addEventListener("click", function () {
      var layout = document.querySelector(".app-layout");
      var open = layout.classList.toggle("nav-open");
      this.setAttribute("aria-expanded", open ? "true" : "false");
    });

    $("sidebar-scrim").addEventListener("click", closeSidebar);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        closeSidebar();
        closeConfirm();
        closeEdit();
      }
    });
  }

  function closeSidebar() {
    document.querySelector(".app-layout").classList.remove("nav-open");
    $("sidebar-toggle").setAttribute("aria-expanded", "false");
  }

  /* ================= Home screen ================= */

  function bindHome() {
    $("home-greeting").textContent = U.greeting();

    var fileInput = $("resume-file-input");
    var card = $("upload-card");

    $("choose-file-btn").addEventListener("click", function () { fileInput.click(); });
    $("replace-resume-btn").addEventListener("click", function () { fileInput.click(); });
    $("upload-retry-btn").addEventListener("click", function () { fileInput.click(); });

    fileInput.addEventListener("change", function () {
      if (fileInput.files && fileInput.files[0]) handleFile(fileInput.files[0]);
      fileInput.value = "";
    });

    ["dragenter", "dragover"].forEach(function (ev) {
      card.addEventListener(ev, function (e) {
        e.preventDefault();
        e.stopPropagation();
        card.classList.add("is-dragover");
      });
    });
    ["dragleave", "drop"].forEach(function (ev) {
      card.addEventListener(ev, function (e) {
        e.preventDefault();
        e.stopPropagation();
        card.classList.remove("is-dragover");
      });
    });
    card.addEventListener("drop", function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) handleFile(f);
    });

    $("analyze-btn").addEventListener("click", function () {
      // Carry the target role into the Job Match input as context.
      var role = $("role-input").value.trim();
      if (role && !$("jd-title").value.trim()) $("jd-title").value = role;
      showView("jobmatch");
      $("jd-text").focus();
    });

    $("home-note").addEventListener("click", function () { showView("jobmatch"); });
  }

  function handleFile(file) {
    hide($("upload-error"));
    var btn = $("choose-file-btn");
    btn.disabled = true;
    btn.textContent = "Reading…";

    JP.file.extractFromFile(file).then(function (out) {
      btn.disabled = false;
      btn.textContent = "Choose file";
      var resume = JP.parseResume(out.text, {
        fileName: file.name,
        kind: out.kind,
        pages: out.pages,
        size: file.size,
      });
      store.setResume({
        fileName: file.name,
        kind: out.kind,
        size: file.size,
        uploadedAt: new Date().toISOString(),
        text: out.text,
        pages: out.pages || null,
        wordCount: resume.meta.wordCount,
        structured: resume, /* the parse everything downstream (verifier, agents, customize) reads */
      });
      store.clearEdits();
      renderUploadState();
      toast("Resume uploaded — ready to analyze.");
    }).catch(function (err) {
      btn.disabled = false;
      btn.textContent = "Choose file";
      hide($("upload-done"));
      hide($("upload-idle"));
      $("upload-error-text").textContent = userMessage(err);
      show($("upload-error"));
    });
  }

  function renderUploadState() {
    var r = store.get().resume;
    if (r) {
      hide($("upload-idle"));
      hide($("upload-error"));
      show($("upload-done"));
      $("upload-done-meta").textContent = "✓ Ready to analyze — " + r.fileName +
        (r.wordCount ? " (" + r.wordCount + " words)" : "");
      $("analyze-btn").disabled = false;
      $("home-note").textContent = "Next: paste the job description on the Job Match screen, then run the analysis.";
    } else {
      show($("upload-idle"));
      hide($("upload-done"));
      hide($("upload-error"));
      $("analyze-btn").disabled = true;
      $("home-note").textContent = "Both a resume and a job description are needed. You can paste the job on the Job Match screen next.";
    }
  }

  /* ================= Job Match input ================= */

  function bindJobMatch() {
    $("tab-paste").addEventListener("click", function () { switchTab("paste"); });
    $("tab-details").addEventListener("click", function () { switchTab("details"); });

    $("jm-analyze-btn").addEventListener("click", startAnalysis);

    var honestInput = $("honest-toggle-input");
    honestInput.checked = !!store.get().settings.brutallyHonest;
    $("honest-state").textContent = honestInput.checked ? "ON" : "OFF";
    honestInput.addEventListener("change", function () {
      store.setHonest(honestInput.checked);
      $("honest-state").textContent = honestInput.checked ? "ON" : "OFF";
      if ($("jm-results").hidden === false && window.JP._lastResult) {
        JP.results.render(window.JP._lastResult, honestInput.checked);
        showResults();
      }
    });

    $("how-calc-btn").addEventListener("click", function () {
      var box = $("score-breakdown");
      var open = box.hidden;
      box.hidden = !open;
      this.setAttribute("aria-expanded", open ? "true" : "false");
    });

    $("see-all-gaps-btn").addEventListener("click", function () {
      var box = $("detail-sections");
      box.hidden = !box.hidden;
      this.textContent = box.hidden ? "See all gaps" : "Hide details";
      if (!box.hidden) box.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function switchTab(which) {
    var paste = which === "paste";
    $("tab-paste").classList.toggle("is-active", paste);
    $("tab-details").classList.toggle("is-active", !paste);
    $("tab-paste").setAttribute("aria-selected", paste ? "true" : "false");
    $("tab-details").setAttribute("aria-selected", paste ? "false" : "true");
    $("panel-paste").hidden = !paste;
    $("panel-details").hidden = paste;
  }

  function startAnalysis() {
    hide($("jm-error"));

    var resume = store.get().resume;
    if (!resume) {
      showJmError("Upload a resume first — the Home screen takes PDF, DOCX or TXT.");
      return;
    }

    var mode = $("tab-paste").classList.contains("is-active") ? "text" : "details";
    var jobInput;

    if (mode === "text") {
      var text = $("jd-text").value.trim();
      if (text.length < 80) {
        showJmError("The job description looks too short. Paste the full posting — responsibilities and requirements included.");
        return;
      }
      jobInput = { mode: "text", text: text };
    } else {
      var url = $("jd-url").value.trim();
      var title = $("jd-title").value.trim();
      var company = $("jd-company").value.trim();
      var pasted = $("jd-text").value.trim();

      if (pasted.length >= 80) {
        jobInput = { mode: "details", text: pasted, title: title, company: company, url: url || null };
      } else {
        // Version 1 runs entirely in the browser; there is no server
        // that could fetch a cross-origin posting. Be honest about it.
        showJmError("We couldn't access this job posting directly.\nPaste the job description to continue — the paste tab reads it instantly, on-device.");
        switchTab("paste");
        return;
      }
    }

    // Run pipeline with progress UI.
    store.setJob(jobInput);
    hide($("jm-input"));
    hide($("jm-results"));
    show($("jm-progress"));
    setProgress(0, JP.ANALYSIS_STAGES[0].label);

    var started = Date.now();
    JP.runAnalysis(resume.text, {
      fileName: resume.fileName,
      kind: resume.kind,
      pages: resume.pages,
      size: resume.size,
    }, jobInput, function (st, i, total) {
      setProgress(i / total, st.label + "…");
    }).then(function (result) {
      // Ensure the progress isn't a flash for trivially fast analyses.
      var elapsed = Date.now() - started;
      var wait = elapsed < 700 ? 700 - elapsed : 0;
      setTimeout(function () {
        window.JP._lastResult = result;
        /* Store the full analysis — Features 2–4 (readiness, verifier, gaps,
           hiring-manager view) read match/insights/priorities from storage. */
        store.setAnalysis(result);
        JP.results.render(result, $("honest-toggle-input").checked);
        hide($("jm-progress"));
        showResults();
      }, wait);
    }).catch(function (err) {
      hide($("jm-progress"));
      show($("jm-input"));
      showJmError(userMessage(err));
    });
  }

  function setProgress(frac, label) {
    $("progress-label").textContent = label;
    $("progress-fill").style.width = Math.round(U.clamp(frac, 0, 1) * 100) + "%";
  }

  function showResults() {
    hide($("jm-progress"));
    hide($("jm-input"));
    show($("jm-results"));
    window.scrollTo(0, 0);
  }

  function showJmError(msg) {
    $("jm-error-text").textContent = msg;
    show($("jm-error"));
  }

  /* ================= Resume screen ================= */

  function renderResumeScreen() {
    var r = store.get().resume;
    var has = !!r;
    $("resume-empty").hidden = has;
    $("resume-content").hidden = !has;
    if (!has) return;

    var resume = JP.parseResume(r.text, { fileName: r.fileName, kind: r.kind, pages: r.pages, size: r.size });

    var stats = $("resume-stats");
    stats.innerHTML = "";
    addStat(r.fileName || "resume");
    addStat((resume.meta.wordCount || 0) + " words");
    if (resume.meta.kind === "pdf" && resume.meta.pages) addStat(resume.meta.pages + " page" + (resume.meta.pages === 1 ? "" : "s"));
    addStat(U.today());

    var sections = $("resume-sections");
    sections.innerHTML = "";
    if (!resume.sections.length) {
      sections.appendChild(el2("li", "risk-none", "No standard sections detected."));
    }
    resume.sections.forEach(function (s) {
      var li = el2("li", "");
      li.innerHTML = "<span>" + U.escapeHtml(s.label) + "</span><span class='risk-none'>" + s.lineCount + " lines</span>";
      sections.appendChild(li);
    });

    var risks = $("resume-risks");
    risks.innerHTML = "";
    if (!resume.formattingRisks.length) {
      risks.appendChild(el2("li", "risk-none", "No structural risks found. Clean headings, bullets and dates."));
    }
    resume.formattingRisks.forEach(function (rk) {
      var li = el2("li", "");
      li.innerHTML = "<span class='risk-dot " + (rk.severity === "high" ? "bad" : rk.severity === "medium" ? "warn" : "good") + "'></span><span>" + U.escapeHtml(rk.risk) + "</span>";
      risks.appendChild(li);
    });

    $("resume-raw").textContent = r.text;

    function addStat(t) {
      var pill = el2("span", "stat-pill");
      pill.textContent = t;
      stats.appendChild(pill);
    }

    function el2(tag, cls, text) {
      var e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text) e.textContent = text;
      return e;
    }
  }

  function bindResume() {
    $("resume-go-home").addEventListener("click", function () { showView("home"); });
    $("resume-download-btn").addEventListener("click", function () {
      var r = store.get().resume;
      if (!r) { toast("No resume to download yet."); return; }
      U.downloadText("jobproof-parsed-" + (r.fileName || "resume").replace(/\.[a-z]+$/i, "") + ".txt", r.text);
    });
    $("resume-delete-btn").addEventListener("click", function () {
      openConfirm("Delete resume?", "This removes the uploaded resume and its parsed text from this device. Accepted rewrites stay until you delete everything.", "Delete resume", function () {
        store.deleteResume();
        store.clearEdits();
        renderUploadState();
        renderResumeScreen();
        toast("Resume deleted.");
      });
    });
  }

  /* ================= Settings ================= */

  function bindSettings() {
    var s = store.get().settings;
    $("settings-honest").checked = !!s.brutallyHonest;
    $("settings-honest").addEventListener("change", function () {
      store.setHonest($("settings-honest").checked);
      $("honest-toggle-input").checked = $("settings-honest").checked;
      $("honest-state").textContent = $("settings-honest").checked ? "ON" : "OFF";
    });

    $("settings-delete-resume").addEventListener("click", function () {
      openConfirm("Delete my resume?", "The uploaded file's text and parse are removed from this device.", "Delete resume", function () {
        store.deleteResume();
        store.clearEdits();
        renderUploadState();
        renderResumeScreen();
        toast("Resume deleted.");
      });
    });

    $("settings-delete-analysis").addEventListener("click", function () {
      openConfirm("Delete my analysis?", "The last analysis result is removed. Your resume stays.", "Delete analysis", function () {
        store.deleteAnalysis();
        window.JP._lastResult = null;
        resetJobMatchUI();
        toast("Analysis deleted.");
      });
    });

    $("settings-delete-all").addEventListener("click", function () {
      openConfirm("Delete everything?", "Removes your resume, analysis, accepted rewrites and settings from this browser. This cannot be undone.", "Delete everything", function () {
        store.deleteAll();
        window.JP._lastResult = null;
        $("settings-honest").checked = false;
        $("honest-toggle-input").checked = false;
        $("honest-state").textContent = "OFF";
        $("jd-text").value = "";
        $("jd-url").value = "";
        $("jd-title").value = "";
        $("jd-company").value = "";
        $("role-input").value = "";
        resetJobMatchUI();
        renderUploadState();
        renderResumeScreen();
        showView("home");
        toast("All local data deleted.");
      });
    });
  }

  function resetJobMatchUI() {
    hide($("jm-results"));
    hide($("jm-progress"));
    show($("jm-input"));
    hide($("jm-error"));
  }

  /* ================= Modals ================= */

  function bindModals() {
    $("confirm-cancel").addEventListener("click", closeConfirm);
    $("confirm-ok").addEventListener("click", function () {
      var cb = confirmCb;
      closeConfirm();
      if (cb) cb();
    });
    $("confirm-overlay").addEventListener("click", function (e) {
      if (e.target === this) closeConfirm();
    });

    $("edit-cancel").addEventListener("click", closeEdit);
    $("edit-save").addEventListener("click", function () {
      var val = $("edit-textarea").value.trim();
      if (!val) { toast("The rewrite can't be empty — use Keep Original instead."); return; }
      var cb = editCb;
      closeEdit();
      if (cb) cb(val);
    });
    $("edit-overlay").addEventListener("click", function (e) {
      if (e.target === this) closeEdit();
    });
  }

  /* ================= Boot ================= */

  function boot() {
    store.load();
    /* Backend connect: hydrate/sync workspace state, then continue boot.
       Boot itself never blocks on the network — the callback finishes
       first-run UI, and connect() reconciles in the background. */
    if (window.JP && JP.api && JP.api.connect) {
      JP.api.connect();
    }
    bindNav();
    bindHome();
    bindJobMatch();
    bindResume();
    bindSettings();
    bindModals();
    renderUploadState();
    renderResumeScreen();

    // Deep link: app.html#jobmatch etc.
    var hash = (location.hash || "").replace("#", "");
    if (["home", "resume", "jobmatch", "applications", "settings", "career", "proof", "activity", "target"].indexOf(hash) !== -1) {
      showView(hash);
      if (hash === "career" && window.JP.career) window.JP.career.render();
      if (hash === "applications" && window.JP.applications) window.JP.applications.render();
      if (hash === "proof" && window.JP.proof) window.JP.proof.render();
      if (hash === "activity" && window.JP.career) window.JP.career.renderActivity();
      if (hash === "target" && window.JP.company) window.JP.company.render();
    } else {
      showView("home");
    }
    renderNextMove();
  }

  /* ================= Home: next-move card (agent decision) ================= */

  function renderNextMove() {
    var host = $("home-note");
    if (!host || !window.JP.agents) return;
    var existing = $("home-next-move");
    if (existing) existing.parentNode.removeChild(existing);
    if (!store.get().analysis) return; // only after a real analysis exists
    var na = window.JP.agents.nextAction();
    if (!na) return;
    var card = document.createElement("div");
    card.className = "card next-move-card";
    card.id = "home-next-move";
    card.innerHTML =
      '<p class="next-move-label">Your next move</p>' +
      '<p class="agent-next-title">' + U.escapeHtml(na.title) + "</p>" +
      '<p class="muted">' + U.escapeHtml(na.why) + "</p>";
    var btn = document.createElement("button");
    btn.className = "btn btn-secondary btn-sm";
    btn.type = "button";
    btn.textContent = na.kind === "mission" ? "Open Missions" : na.kind === "apply" ? "Open Applications" : na.kind === "interview" ? "Start Interview" : na.kind === "evidence" ? "Add Evidence" : "Open Job Match";
    btn.addEventListener("click", function () {
      if (na.kind === "mission") { showView("career"); window.JP.career.render(); }
      else if (na.kind === "apply") { showView("applications"); window.JP.applications.render(); }
      else if (na.kind === "interview") { showView("proof"); window.JP.proof.render(); }
      else if (na.kind === "evidence") { window.JP.modals.openEvidence("", function () { renderNextMove(); }); }
      else { showView("jobmatch"); }
    });
    card.appendChild(btn);
    host.parentNode.insertBefore(card, host);
  }

  JP.app = { showView: function (name) {
    showView(name);
    if (name === "career" && window.JP.career) window.JP.career.render();
    if (name === "applications" && window.JP.applications) window.JP.applications.render();
    if (name === "proof" && window.JP.proof) window.JP.proof.render();
    if (name === "activity" && window.JP.career) window.JP.career.renderActivity();
    if (name === "target" && window.JP.company) window.JP.company.render();
    renderNextMove();
  } };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
