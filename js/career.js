/* ============================================================
   JobProof AI — js/career.js
   Feature 2 UI: Career Readiness (readiness state, blockers,
   hiring-manager review, fix-first, missions, career agent) and
   the Agent Activity page that shows the orchestrator's real log.
   ============================================================ */

(function () {
  "use strict";

  var JP = window.JP;
  var U = JP.util;
  var store = JP.store;
  var $ = function (id) { return document.getElementById(id); };
  var esc = U.escapeHtml;

  var currentTab = "readiness";

  /* ================= helpers ================= */

  function refreshLedger() {
    var d = store.get();
    return JP.verifier.computeAll({ resume: d.resume, analysis: d.analysis });
  }

  function stateClass(state) {
    if (state === "Ready") return "st-ready";
    if (state === "Nearly Ready") return "st-nearly";
    if (state === "Needs Work") return "st-needswork";
    return "st-insufficient";
  }

  function statusCls(s) {
    if (s === "Verified") return "is-verified";
    if (s === "In Progress") return "is-progress";
    if (s === "Not Started") return "is-todo";
    if (s === "Needs Improvement") return "is-warn";
    return "is-part";
  }

  function fmtDate(iso) {
    try {
      return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    } catch (e) { return ""; }
  }

  /* ================= render ================= */

  function render() {
    var root = $("career-root");
    if (!root) return;
    var d = store.get();

    if (!d.analysis) {
      root.innerHTML =
        '<h1 class="screen-title">Career Readiness</h1>' +
        '<div class="empty-state">' +
        '<p><strong>Career Readiness needs a target role and profile analysis first.</strong></p>' +
        '<p class="muted">The agents assess your resume against a concrete role. Without one, any readiness claim would be invented.</p>' +
        '<button class="btn btn-primary" id="cr-analyze-btn" type="button">Analyze a Job</button>' +
        '</div>';
      bind("cr-analyze-btn", goAnalyze);
      return;
    }

    var open = openMissionCount();
    root.innerHTML =
      '<h1 class="screen-title">Career Readiness</h1>' +
      '<div class="tabbar" role="tablist" aria-label="Career Readiness sections">' +
      tabBtn("readiness", "Readiness") +
      tabBtn("missions", "Missions" + (open ? ' <span class="count-pill">' + open + "</span>" : "")) +
      tabBtn("agent", "Career Agent") +
      "</div>" +
      '<div id="cr-body"></div>';
    renderTab();
  }

  function tabBtn(key, label) {
    return '<button class="tab-btn' + (currentTab === key ? " is-active" : "") +
      '" data-tab="' + key + '" role="tab" aria-selected="' + (currentTab === key) + '" type="button">' + label + "</button>";
  }

  function openMissionCount() {
    return store.f2().missions.filter(function (m) {
      return m.status === "Not Started" || m.status === "In Progress";
    }).length;
  }

  function renderTab() {
    var body = $("cr-body");
    if (!body) return;
    if (currentTab === "readiness") {
      body.innerHTML = readinessHtml() + blockersHtml() + managerHtml() + fixFirstHtml();
    } else if (currentTab === "missions") {
      body.innerHTML = missionsHtml();
    } else {
      body.innerHTML = agentHtml();
    }
    wireTab();
  }

  function goAnalyze() {
    if (JP.app && JP.app.showView) JP.app.showView("jobmatch");
  }

  /* ================= Readiness tab ================= */

  function readinessHtml() {
    var d = store.get();
    var state = JP.agents.readinessState();
    var jobTitle = (d.job && d.job.title) || (d.analysis.match.role ? d.analysis.match.role.label : "target role");

    return '<div class="card readiness-head">' +
      '<div class="readiness-left">' +
      '<p class="readiness-label">Target role</p>' +
      '<p class="readiness-role">' + esc(jobTitle) + "</p>" +
      '<p class="muted">From your Job Match analysis &middot; ' + esc(U.today()) + "</p>" +
      "</div>" +
      '<div class="readiness-right">' +
      '<p class="readiness-label">Your current readiness</p>' +
      '<p class="readiness-state ' + stateClass(state) + '">' + esc(state) + "</p>" +
      '<p class="muted">Not a hiring prediction &mdash; a state derived from verified, partial, and unproven skills.</p>' +
      "</div></div>";
  }

  function blockersHtml() {
    var gaps = refreshLedger().gaps.slice(0, 5);
    if (!gaps.length) {
      return '<div class="card"><h2 class="card-title">What is holding you back?</h2>' +
        '<p>No major gaps identified from the available evidence.</p>' +
        '<p class="muted">That is not a guarantee &mdash; it means your current evidence covers the requirements we could evaluate.</p></div>';
    }
    var html = '<div class="card"><h2 class="card-title">What is holding you back?</h2><div class="blocker-list">';
    gaps.forEach(function (g, i) {
      html += '<div class="blocker" data-gap="' + esc(g.id) + '">' +
        '<p class="blocker-title"><span class="blocker-num">' + (i + 1) + "</span> " + esc(g.title) +
        ' <span class="status-pill ' + pillFor(g.status) + '">' + esc(g.status) + "</span></p>" +
        '<p class="muted">' + esc(g.why) + "</p>" +
        '<p class="blocker-evidence"><strong>Your evidence:</strong> ' + esc(g.currentEvidence) + "</p>" +
        '<p class="blocker-action"><strong>Recommended action:</strong> ' + esc(g.requiredEvidence) + "</p>" +
        '<div class="blocker-actions">' +
        (g.resumeFix
          ? '<button class="btn btn-secondary btn-sm" data-act="improve-resume">Improve Resume</button>'
          : '<button class="btn btn-secondary btn-sm" data-act="create-mission">Create mission</button>') +
        '<button class="btn btn-ghost btn-sm" data-act="add-evidence" data-skill="' + esc(g.title) + '">Add evidence</button>' +
        "</div></div>";
    });
    return html + "</div></div>";
  }

  function pillFor(status) {
    if (status === "VERIFIED") return "is-verified";
    if (status === "PARTIAL") return "is-part";
    return "is-miss";
  }

  /* Hiring Manager View — labeled as an AI perspective, built from
     Feature 1's insights output. */

  function managerHtml() {
    var ins = store.get().analysis && store.get().analysis.insights;
    if (!ins) return "";
    var v = ins; /* insights output: {firstImpression, attention, skim, concern} */
    function lis(arr, withBullets) {
      if (!arr || !arr.length) return "";
      return "<ul>" + arr.map(function (x) {
        var text = typeof x === "string" ? x : x.text;
        var cls = typeof x === "string" ? "" : ' <span class="cls-pill">' + esc(x.classification || "") + "</span>";
        return "<li>" + esc(text) + cls + "</li>";
      }).join("") + "</ul>";
    }
    return '<div class="card"><div class="card-label-row">' +
      '<h2 class="card-title">Hiring Manager View</h2>' +
      '<span class="ai-pill">AI hiring-manager perspective</span></div>' +
      '<h3 class="sub-title">First impression</h3>' +
      "<p>" + esc(v.firstImpression || "Not enough evidence to determine this.") + "</p>" +
      (v.attention && v.attention.length ? '<h3 class="sub-title">What stands out</h3>' + lis(v.attention) : "") +
      (v.skim && v.skim.length ? '<h3 class="sub-title">What gets skimmed</h3>' + lis(v.skim) : "") +
      (v.concern && v.concern.length ? '<h3 class="sub-title">What raises questions</h3>' + lis(v.concern) : "") +
      "</div>";
  }

  /* Fix First — from Feature 1 priorities, each with an action. */

  function fixFirstHtml() {
    var pr = store.get().analysis && store.get().analysis.priorities;
    if (!pr || !pr.items || !pr.items.length) return "";
    var html = '<div class="card"><h2 class="card-title">Fix First</h2><div class="priority-list">';
    pr.items.forEach(function (p, i) {
      html += '<div class="priority-item" data-prio="' + i + '">' +
        '<p class="priority-rank">' + (i + 1) + "</p>" +
        "<div><p><strong>" + esc(p.title) + "</strong></p>" +
        '<p class="muted"><strong>Why:</strong> ' + esc(p.why) + "</p>" +
        '<p class="muted"><strong>What to change:</strong> ' + esc(p.what) + "</p>" +
        '<div class="blocker-actions">' +
        '<button class="btn btn-secondary btn-sm" data-act="improve-resume">Improve Resume</button>' +
        '<button class="btn btn-ghost btn-sm" data-act="create-mission">Create mission</button>' +
        "</div></div></div>";
    });
    return html + "</div></div>";
  }

  /* ================= Missions tab ================= */

  function missionsHtml() {
    var f2 = store.f2();
    if (!f2.missions.length) {
      return '<div class="card"><h2 class="card-title">Your Missions</h2>' +
        '<p class="muted">No missions yet. Missions are generated from your actual gaps on the Readiness tab.</p></div>';
    }
    return '<h2 class="screen-subtitle">Your Missions</h2>' + f2.missions.map(missionCard).join("");
  }

  function missionCard(m) {
    var steps = m.steps.map(function (s, i) {
      var done = (m.progress || 0) >= ((i + 1) / m.steps.length) * 100;
      return '<li class="' + (done ? "is-done" : "") + '">' + esc(s) + "</li>";
    }).join("");
    return '<div class="card mission-card" data-id="' + esc(m.id) + '">' +
      '<div class="mission-head"><div>' +
      '<p class="mission-type">' + esc(m.type) + " &middot; " + esc(m.estimatedEffort || "") + "</p>" +
      '<h3 class="mission-title">' + esc(m.title) + "</h3>" +
      '<p class="muted">' + esc(m.why) + "</p>" +
      "</div>" +
      '<span class="status-pill ' + statusCls(m.status) + '">' + esc(m.status) + "</span></div>" +
      '<div class="mission-progress"><div class="mission-progress-bar" style="width:' + (m.progress || 0) + '%"></div></div>' +
      '<ol class="mission-steps">' + steps + "</ol>" +
      '<p class="mission-evreq"><strong>Evidence required:</strong> ' + esc(m.evidenceRequirements.join(" &middot; ")) + "</p>" +
      '<div class="mission-actions">' +
      (m.status === "Not Started" ? '<button class="btn btn-primary btn-sm" data-act="start" type="button">Start mission</button>' : "") +
      (m.status === "In Progress" ? '<button class="btn btn-primary btn-sm" data-act="complete" type="button">Complete mission</button>' : "") +
      (m.status !== "Verified" ? '<button class="btn btn-ghost btn-sm" data-act="evidence" type="button">Add evidence</button>' : "") +
      "</div></div>";
  }

  /* ================= Career Agent tab ================= */

  function agentHtml() {
    var na = JP.agents.nextAction();
    var reasons = agentReasons();
    var html = '<div class="card agent-card">' +
      '<h2 class="card-title">Your next move</h2>' +
      '<div class="agent-next">' +
      '<p class="agent-next-title">' + esc(na.title) + "</p>" +
      '<p class="muted">' + esc(na.why) + "</p>" +
      '<button class="btn btn-primary" id="agent-go-btn" type="button">Start</button>' +
      "</div>" +
      '<p class="muted">Decision priority: critical requirement gaps, then missing evidence, then missions, then interview validation, then applications, then re-analysis.</p>' +
      "</div>" +
      '<div class="card"><h2 class="card-title">Decision log</h2>' +
      '<p class="card-sub">What the agent considered and why this action won.</p>' +
      "<ul>" + reasons.map(function (r) {
        return "<li><strong>" + esc(r.title) + "</strong> &mdash; " + esc(r.body) + "</li>";
      }).join("") + "</ul></div>";
    return html;
  }

  function agentReasons() {
    var f2 = store.f2();
    var list = [];
    var active = f2.missions.find(function (m) { return m.status === "In Progress"; });
    if (active) list.push({ title: "Active mission takes priority", body: "Finish what you started before opening new fronts." });
    var unproven = f2.skills.filter(function (s) { return s.claimed && s.status === "NOT VERIFIED"; });
    if (unproven.length) list.push({ title: unproven.length + " claimed skill(s) with no supporting evidence", body: "Unproven claims are a risk in applications and interviews." });
    var ready = store.f3().applications.filter(function (a) { return a.status === "Ready to Apply"; });
    if (ready.length) list.push({ title: ready.length + " application(s) ready to submit", body: "Reviewed and prepared applications wait for nothing." });
    if (!list.length) list.push({ title: "No pressing actions", body: "Current evidence covers what the agents can evaluate right now." });
    return list;
  }

  /* ================= wiring ================= */

  function bind(id, fn) {
    var el = $(id);
    if (el) el.addEventListener("click", fn);
  }

  function wireTab() {
    document.querySelectorAll("#career-root .tab-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        currentTab = btn.dataset.tab;
        render();
      });
    });
    document.querySelectorAll("#cr-body [data-act]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        var act = btn.dataset.act;
        if (act === "improve-resume") { goAnalyze(); return; }
        if (act === "add-evidence") {
          JP.modals.openEvidence(btn.dataset.skill || "", function () { render(); });
          return;
        }
        var cardEl = btn.closest("[data-gap]");
        var gap = null;
        if (cardEl) {
          var gapId = cardEl.getAttribute("data-gap");
          gap = refreshLedger().gaps.find(function (g) { return g.id === gapId; });
        }
        if (act === "create-mission") {
          if (!gap) return;
          JP.missions.syncFromGaps([gap]);
          JP.ui.toast("Mission created from this gap.");
          currentTab = "missions";
          render();
        }
      });
    });
    document.querySelectorAll("#cr-body .mission-card [data-act]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.closest(".mission-card").getAttribute("data-id");
        var m = store.f2().missions.find(function (x) { return x.id === id; });
        if (!m) return;
        var act = btn.dataset.act;
        if (act === "start") { JP.missions.setStatus(m.id, "In Progress"); render(); }
        if (act === "complete") { JP.modals.openMissionComplete(m, function () { render(); }); }
        if (act === "evidence") { JP.modals.openEvidence(m.skill, function () { render(); }); }
      });
    });
    bind("agent-go-btn", function () {
      var na = JP.agents.nextAction();
      if (na.kind === "mission") { currentTab = "missions"; render(); }
      else if (na.kind === "analyze") { goAnalyze(); }
      else if (na.kind === "apply") { JP.app.showView("applications"); }
      else if (na.kind === "evidence") { JP.modals.openEvidence("", function () { render(); }); }
      else if (na.kind === "interview") { JP.app.showView("proof"); }
    });
  }

  /* ================= Agent Activity page ================= */

  function renderActivity() {
    var root = $("activity-root");
    if (!root) return;
    var d = store.get();
    var rows = (d.activity || []).map(function (a) {
      var t = new Date(a.ts);
      var hh = ("0" + t.getHours()).slice(-2) + ":" + ("0" + t.getMinutes()).slice(-2) + ":" + ("0" + t.getSeconds()).slice(-2);
      var st = a.state === "COMPLETED" ? "ok" : a.state === "RUNNING" ? "run" : a.state === "FAILED" ? "fail" : "wait";
      return '<div class="act-row"><span class="act-time">' + hh + "</span>" +
        '<span class="act-agent">' + esc(a.agent) + "</span>" +
        '<span class="act-state ' + st + '">' + esc(a.state) + "</span>" +
        '<span class="act-text">' + esc(a.text) + "</span></div>";
    }).join("");
    root.innerHTML =
      '<h1 class="screen-title">Agent Activity</h1>' +
      '<p class="screen-sub">What the orchestrator and its agents actually did &mdash; every entry is a real state change.</p>' +
      '<div class="card act-log">' + (rows || '<p class="muted">No agent runs yet. Start an assessment on the Career Readiness page.</p>') + "</div>";
  }

  JP.career = { render: render, renderActivity: renderActivity };
})();
