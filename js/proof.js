/* ============================================================
   JobProof AI — js/proof.js
   Feature 4 UI: Proof Center. Separates CLAIM vs EVIDENCE vs
   VERIFICATION for every skill, runs the adaptive interview,
   keeps verification history, and generates the JobProof
   Verification Report (labeled as exactly that — not a
   certification). Counts are always real store data.
   ============================================================ */

(function () {
  "use strict";

  var JP = window.JP;
  var U = JP.util;
  var store = JP.store;
  var $ = function (id) { return document.getElementById(id); };
  var esc = U.escapeHtml;

  /* ================= render ================= */

  function render() {
    var root = $("proof-root");
    if (!root) return;
    var d = store.get();
    var res = refreshLedger();

    if (!d.analysis && !res.skills.length) {
      root.innerHTML =
        '<h1 class="screen-title">Proof Center</h1>' +
        '<div class="empty-state"><p><strong>Nothing to prove yet.</strong></p>' +
        '<p class="muted">Run a job analysis first \u2014 the proof map is built from your target role\u2019s requirements and your claims.</p>' +
        '<button class="btn btn-primary" id="pf-analyze-btn" type="button">Analyze a Job</button></div>';
      var b = $("pf-analyze-btn");
      if (b) b.addEventListener("click", function () { JP.app.showView("jobmatch"); });
      return;
    }

    root.innerHTML =
      '<h1 class="screen-title">Proof Center</h1>' +
      '<p class="screen-sub">Turn your claims into evidence.</p>' +
      proofCountsHtml() +
      '<div class="card"><div class="card-label-row">' +
      '<h2 class="card-title">Skill proof map</h2>' +
      '<button class="btn btn-secondary btn-sm" id="pf-add-evidence" type="button">Add Proof</button>' +
      "</div>" +
      '<p class="card-sub">Status comes only from evidence on file. A claim without evidence stays unverified \u2014 that is not a judgment about you.</p>' +
      '<div id="pf-skills">' + skillsHtml(res.skills) + "</div></div>" +
      guideHtml() +
      interviewHtml() +
      historyHtml() +
      reportHtml();

    wire();
  }

  function refreshLedger() {
    var d = store.get();
    return JP.verifier.computeAll({ resume: d.resume, analysis: d.analysis });
  }

  function proofCountsHtml() {
    var f2 = store.f2();
    var skills = f2.skills;
    var verified = skills.filter(function (s) { return s.status === "VERIFIED"; }).length;
    var partial = skills.filter(function (s) { return s.status === "PARTIAL"; }).length;
    var unverified = skills.filter(function (s) {
      return s.status !== "VERIFIED" && s.status !== "PARTIAL"; /* INSUFFICIENT EVIDENCE and NOT VERIFIED both count as unproven */
    }).length;
    var evidenceCount = f2.evidence.length;

    if (!skills.length) {
      return '<div class="card"><h2 class="card-title">Your Proof</h2><p class="muted">No evidence submitted yet.</p></div>';
    }
    return '<div class="card proof-counts">' +
      '<div><p class="proof-num st-ready">' + verified + "</p><p class=\"muted\">Verified</p></div>" +
      '<div><p class="proof-num is-part">' + partial + "</p><p class=\"muted\">Partial</p></div>" +
      '<div><p class="proof-num is-miss">' + unverified + "</p><p class=\"muted\">Not verified</p></div>" +
      '<div><p class="proof-num">' + evidenceCount + "</p><p class=\"muted\">Evidence items</p></div>" +
      "</div>";
  }

  function statusCls(status) {
    if (status === "VERIFIED") return "is-verified";
    if (status === "PARTIAL") return "is-part";
    if (status === "NOT VERIFIED") return "is-miss";
    return "is-warn";
  }

  function skillsHtml(skills) {
    if (!skills.length) {
      return '<p class="muted">No skills tracked yet \u2014 add evidence or run an analysis.</p>';
    }
    return skills.map(function (s) {
      var items = store.f2().evidence.filter(function (e) { return e.skill && normEq(e.skill, s.name); });
      var evList = items.length
        ? "<ul>" + items.slice(0, 4).map(function (e) {
            var link = e.url ? ' <a href="' + esc(e.url) + '" target="_blank" rel="noopener noreferrer">link</a>' : "";
            return "<li>" + esc(e.source || e.type) + " \u00b7 " + esc(fmtDate(e.submittedAt)) + link + "</li>";
          }).join("") + "</ul>"
        : '<p class="muted">No supporting evidence found.</p>';
      var tags = [];
      if (s.required) tags.push('<span class="tag">Job requirement</span>');
      if (s.claimed) tags.push('<span class="tag">Your claim</span>');
      return '<div class="skill-row" data-skill="' + esc(s.name) + '">' +
        '<div class="skill-row-head">' +
        '<p class="skill-name">' + esc(s.name) + " " + tags.join(" ") + "</p>" +
        '<span class="status-pill ' + statusCls(s.status) + '">' + esc(s.status) + "</span>" +
        "</div>" +
        '<div class="claim-grid">' +
        '<div><p class="ba-label">Claim</p><p>' + (s.claimed ? "Listed on your resume" : "Required by the role") + "</p></div>" +
        '<div><p class="ba-label">What the evidence supports</p><p>' + esc(s.reason) + "</p></div>" +
        '<div><p class="ba-label">What it does not establish</p><p>' + esc(s.limitations || "\u2014") + "</p></div>" +
        "</div>" +
        evList +
        (s.status !== "VERIFIED" ? '<button class="btn btn-ghost btn-sm" data-add-for="' + esc(s.name) + '" type="button">Add evidence for ' + esc(s.name) + "</button>" : "") +
        "</div>";
    }).join("");
  }

  function normEq(a, b) {
    return String(a).toLowerCase().trim() === String(b).toLowerCase().trim();
  }

  /* ================= Career guide ================= */

  function guideHtml() {
    var na = JP.agents.nextAction();
    return '<div class="card agent-card">' +
      '<h2 class="card-title">Your Career Guide</h2>' +
      '<div class="agent-next">' +
      '<p class="agent-next-title">' + esc(na.title) + "</p>" +
      '<p class="muted">' + esc(na.why) + "</p>" +
      '<button class="btn btn-primary" id="pf-guide-go" type="button">Do it</button>' +
      "</div></div>";
  }

  /* ================= Adaptive interview ================= */

  function interviewHtml() {
    var interview = JP.interview.latest();
    var skills = store.f2().skills.filter(function (s) { return s.required || s.claimed; }).length;
    if (!skills) {
      return '<div class="card"><h2 class="card-title">Adaptive Interview</h2>' +
        '<p class="muted">No interviewable skills yet \u2014 run an analysis first.</p></div>';
    }
    if (interview && interview.status === "in-progress") {
      return '<div class="card" id="pf-interview">' + interviewBody(interview) + "</div>";
    }
    var last = interview && interview.status === "completed" ? interview : null;
    return '<div class="card">' +
      '<h2 class="card-title">Adaptive Interview</h2>' +
      '<p class="card-sub">Questions built from your target role, your claims, and your actual projects. Difficulty adapts to your answers. Results feed your proof map as validation evidence.</p>' +
      (last
        ? '<p class="muted">Last assessment: ' + esc(fmtDate(last.completedAt)) + " \u00b7 overall " + last.result.overall + "/100.</p>"
        : "") +
      '<button class="btn btn-primary" id="pf-start-interview" type="button">Start interview</button>' +
      '<p class="muted">Labeled a JobProof interview assessment \u2014 not a hiring prediction.</p>' +
      "</div>";
  }

  function interviewBody(interview) {
    var answered = interview.items.filter(function (it) { return it.evaluation; });
    var current = interview.items[answered.length] || null;
    var done = answered.length >= JP.interview.MAX_QUESTIONS;
    var html = '<h2 class="card-title">Adaptive Interview</h2>' +
      '<p class="muted">Question ' + (answered.length + (done ? 0 : 1)) + " of " + JP.interview.MAX_QUESTIONS +
      " \u00b7 target: " + esc(interview.targetRole) + "</p>";

    // Show the evaluation of the previous answer.
    var prev = answered[answered.length - 1];
    if (prev && prev.evaluation) {
      var ev = prev.evaluation;
      html += '<div class="review-block">' +
        '<p class="ba-label">Your last answer</p><p class="ba-text">' + esc(prev.answer) + "</p>" +
        '<p class="muted">' + esc(prev.evaluation.notes.join(" ")) + "</p>" +
        evalBar("Coverage", ev.coverage) + evalBar("Articulation", ev.accuracy) + evalBar("Clarity", ev.clarity) +
        "</div>";
    }

    if (done || !current) {
      html += '<div class="blocker-actions">' +
        '<button class="btn btn-primary" id="pf-finish-interview" type="button">Finish &amp; assess</button>' +
        '<button class="btn btn-ghost" id="pf-abandon-interview" type="button">Discard</button>' +
        "</div></div>";
      return html;
    }

    html += '<div class="review-block">' +
      '<p class="ba-label">' + esc(current.concept) + " \u00b7 level " + current.difficulty + "</p>" +
      '<p class="interview-q">' + esc(current.question) + "</p>" +
      '<textarea id="pf-answer" rows="4" placeholder="Answer as you would in a real interview \u2014 specifics beat generalities."></textarea>' +
      '<div class="blocker-actions">' +
      '<button class="btn btn-primary" id="pf-submit-answer" type="button">Submit answer</button>' +
      '<button class="btn btn-ghost" id="pf-abandon-interview" type="button">Discard interview</button>' +
      "</div></div>";
    return html;
  }

  function evalBar(label, pct) {
    pct = Math.max(0, Math.min(100, pct || 0));
    return '<div class="eval-row"><span class="eval-label">' + esc(label) + "</span>" +
      '<span class="eval-track"><span class="eval-fill" style="width:' + pct + '%"></span></span>' +
      "<span class=\"eval-pct\">" + pct + "</span></div>";
  }

  function wireInterview() {
    var answerBtn = $("pf-submit-answer");
    if (answerBtn) {
      answerBtn.addEventListener("click", function () {
        var interview = JP.interview.latest();
        if (!interview) return;
        var answered = interview.items.filter(function (it) { return it.evaluation; });
        var current = interview.items[answered.length];
        var ta = $("pf-answer");
        var text = (ta && ta.value || "").trim();
        if (text.length < 5) { JP.ui.toast("Write an answer first \u2014 even a short honest one."); return; }
        JP.interview.submitAnswer(interview, current.id, text);
        render();
      });
    }
    var finishBtn = $("pf-finish-interview");
    if (finishBtn) {
      finishBtn.addEventListener("click", function () {
        var interview = JP.interview.latest();
        if (!interview) return;
        JP.interview.complete(interview);
        JP.ui.toast("Assessment recorded \u2014 proof map updated.");
        render();
      });
    }
    var abandonBtn = $("pf-abandon-interview");
    if (abandonBtn) {
      abandonBtn.addEventListener("click", function () {
        var f2 = store.f2();
        f2.interviews = f2.interviews.filter(function (i) { return i.status !== "in-progress"; });
        store.save();
        render();
      });
    }
    var startBtn = $("pf-start-interview");
    if (startBtn) {
      startBtn.addEventListener("click", startInterview);
    }
  }

  function startInterview() {
    var d = store.get();
    if (!d.analysis) { JP.ui.toast("Run a job analysis first \u2014 the interview needs a target role."); return; }
    var existing = JP.interview.latest();
    if (existing && existing.status === "in-progress") { render(); return; }
    JP.interview.start();
    render();
  }

  /* ================= Verification history ================= */

  function historyHtml() {
    var f2 = store.f2();
    if (!f2.history.length) return "";
    var rows = f2.history.slice(0, 8).map(function (h) {
      return '<div class="hist-row"><span class="act-agent">' + esc(h.skill) + "</span>" +
        '<span class="muted">' + esc(h.oldStatus) + " \u2192 " + esc(h.newStatus) + "</span>" +
        '<span class="muted">' + esc(fmtDate(h.at)) + "</span></div>";
    }).join("");
    return '<div class="card"><h2 class="card-title">Verification History</h2>' +
      '<p class="card-sub">Status changes stay on record \u2014 verifications are timestamped and traceable.</p>' + rows + "</div>";
  }

  /* ================= Verification report ================= */

  function reportHtml() {
    return '<div class="card"><h2 class="card-title">JobProof Verification Report</h2>' +
      '<p class="card-sub">A downloadable summary of your evidence and what it supports. It is not an employer certification, academic qualification, or professional accreditation.</p>' +
      '<button class="btn btn-secondary" id="pf-gen-report" type="button">Generate Report</button>' +
      "</div>";
  }

  function generateReport() {
    var d = store.get();
    var f2 = store.f2();
    var res = refreshLedger();
    var role = (d.job && d.job.title) || (d.analysis && d.analysis.match.role ? d.analysis.match.role.label : "Target role");
    var verified = res.skills.filter(function (s) { return s.status === "VERIFIED"; });
    var partial = res.skills.filter(function (s) { return s.status === "PARTIAL"; });
    var unverified = res.skills.filter(function (s) {
      return s.status !== "VERIFIED" && s.status !== "PARTIAL"; /* INSUFFICIENT EVIDENCE and NOT VERIFIED both count as unproven */
    });
    var missions = f2.missions;
    var interviews = f2.interviews.filter(function (i) { return i.status === "completed"; });
    var id = "JP-" + new Date().toISOString().slice(0, 10).replace(/-/g, "") + "-" + Math.random().toString(36).slice(2, 7).toUpperCase();

    var lines = [];
    lines.push("JOBPROOF VERIFICATION REPORT");
    lines.push("=".repeat(40));
    lines.push("");
    lines.push("Report ID: " + id);
    lines.push("Generated: " + new Date().toLocaleString());
    lines.push("Candidate: " + (d.profile && d.profile.name ? d.profile.name : "(name not set)"));
    lines.push("Target role: " + role);
    lines.push("");
    lines.push("This document summarizes evidence reviewed by JobProof AI. It is not an");
    lines.push("employer certification, academic qualification, or professional accreditation.");
    lines.push("");
    lines.push("VERIFIED SKILLS (" + verified.length + ")");
    verified.forEach(function (s) {
      lines.push("  - " + s.name + ": " + s.reason);
    });
    if (!verified.length) lines.push("  (none yet)");
    lines.push("");
    lines.push("PARTIALLY SUPPORTED (" + partial.length + ")");
    partial.forEach(function (s) {
      lines.push("  - " + s.name + ": " + s.reason);
      if (s.limitations) lines.push("      Not established: " + s.limitations);
    });
    if (!partial.length) lines.push("  (none yet)");
    lines.push("");
    lines.push("UNSUPPORTED CLAIMS (" + unverified.length + ")");
    unverified.forEach(function (s) {
      lines.push("  - " + s.name + (s.claimed ? " (claimed on resume)" : "") + ": " + s.reason);
    });
    if (!unverified.length) lines.push("  (none)");
    lines.push("");
    lines.push("EVIDENCE ON FILE (" + f2.evidence.length + " items)");
    f2.evidence.slice(0, 15).forEach(function (e) {
      lines.push("  - [" + e.type + "] " + (e.skill || "general") + " \u2014 " + (e.source || "user-provided") +
        (e.url ? " (" + e.url + ")" : "") + " \u00b7 " + fmtDate(e.submittedAt));
    });
    if (!f2.evidence.length) lines.push("  (none submitted)");
    lines.push("");
    lines.push("INTERVIEW ASSESSMENTS (" + interviews.length + ")");
    interviews.forEach(function (iv) {
      lines.push("  - " + fmtDate(iv.completedAt) + ": overall " + iv.result.overall + "/100 \u2014 " +
        iv.result.assessments.map(function (a) { return a.skill + " " + a.status; }).join(", "));
    });
    if (!interviews.length) lines.push("  (none completed)");
    lines.push("");
    lines.push("MISSIONS (" + missions.length + ")");
    missions.forEach(function (m) {
      lines.push("  - [" + m.status + "] " + m.title + " (" + m.type + ")");
    });
    if (!missions.length) lines.push("  (none generated)");
    lines.push("");
    lines.push("REMAINING GAPS (" + refreshLedger().gaps.length + ")");
    refreshLedger().gaps.forEach(function (g) {
      lines.push("  - " + g.title + ": " + g.why);
    });
    lines.push("");
    lines.push("Readiness state: " + JP.agents.readinessState());
    lines.push("Next action: " + JP.agents.nextAction().title);
    lines.push("");
    lines.push("Every claim above is traceable to the evidence listed. Where evidence was");
    lines.push("insufficient, JobProof said so instead of guessing.");

    U.downloadText("JobProof-Verification-Report-" + id + ".txt", lines.join("\n"));
    f2.reports.unshift({ id: id, generatedAt: new Date().toISOString() });
    store.save();
    JP.agents.log("Proof Center", JP.agents.S.COMPLETED, "Verification report " + id + " generated.");
    JP.ui.toast("Report downloaded.");
  }

  /* ================= wiring ================= */

  function fmtDate(iso) {
    try { return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
    catch (e) { return ""; }
  }

  function wire() {
    var addBtn = $("pf-add-evidence");
    if (addBtn) addBtn.addEventListener("click", function () {
      JP.modals.openEvidence("", function () { render(); });
    });
    var analyzeBtn = $("pf-analyze-btn");
    if (analyzeBtn) analyzeBtn.addEventListener("click", function () { JP.app.showView("jobmatch"); });
    var guideBtn = $("pf-guide-go");
    if (guideBtn) guideBtn.addEventListener("click", function () {
      var na = JP.agents.nextAction();
      if (na.kind === "mission") JP.app.showView("career");
      else if (na.kind === "analyze") JP.app.showView("jobmatch");
      else if (na.kind === "apply") JP.app.showView("applications");
      else if (na.kind === "interview") startInterview();
      else if (na.kind === "evidence") JP.modals.openEvidence("", function () { render(); });
    });
    wireInterview();
    var genBtn = $("pf-gen-report");
    if (genBtn) genBtn.addEventListener("click", generateReport);
    document.querySelectorAll("[data-add-for]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        JP.modals.openEvidence(btn.getAttribute("data-add-for"), function () { render(); });
      });
    });
  }

  JP.proof = {
    render: render,
    startInterview: startInterview,
  };
})();
