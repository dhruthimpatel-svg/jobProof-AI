/* ============================================================
   JobProof AI — js/company.js
   Company Target Mode. ADDITIVE feature: reuses the existing
   engine (jd.js, analysis.js, insights.js, rewrite.js, missions,
   verifier, agents) — no duplicate matching, no fabricated
   company data. Requirements come from the job posting the user
   supplies (official careers text / URL text) and are labeled:
   OFFICIAL REQUIREMENT / AI-INFERRED / USER EVIDENCE.
   The engine never invents: where information is missing it says
   "Not enough evidence to determine this."
   ============================================================ */

(function () {
  "use strict";

  var JP = window.JP;
  var U = JP.util;
  var store = JP.store;
  var $ = function (id) { return document.getElementById(id); };
  var esc = U.escapeHtml;

  var activeTab = "overview";
  var lastResults = null; // in-memory render of the last target evaluation

  /* ================= store: f4 = company targets ================= */

  function f4() {
    var d = store.get();
    if (!d.f4) {
      d.f4 = { targets: [], activeId: null };
      store.save();
    }
    return d.f4;
  }

  function allTargets() { return f4().targets; }
  function activeTarget() {
    var f = f4();
    return f.targets.find(function (t) { return t.id === f.activeId; }) || null;
  }

  function uid(p) { return store.uid(p); }
  function now() { return new Date().toISOString(); }
  function fmtDate(iso) {
    try { return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
    catch (e) { return ""; }
  }

  function log(agent, state, text) {
    if (JP.agents && JP.agents.log) JP.agents.log(agent, state, text);
  }

  /* ================= research: build requirements from a posting ================= */

  /* Requirements come ONLY from the posting text the user supplies.
     Source label: the user asserts where the text came from; we label
     it OFFICIAL (they said it's from the company's careers page),
     EXTERNAL (they said it's from a job board / other source), or
     AI-INFERRED (role knowledge when no posting is provided). */

  function researchTarget(t, postingText, sourceKind, sourceUrl, onStep) {
    onStep = onStep || function () {};
    var steps = [
      ["Company Research Agent", "Reading the posting you supplied"],
      ["Requirement Analysis Agent", "Extracting required and preferred qualifications"],
      ["Resume Agent", "Comparing your resume against the target"],
      ["Evidence Agent", "Checking supporting evidence"],
      ["Gap Agent", "Identifying missing proof"],
      ["Career Agent", "Creating your preparation roadmap"],
    ];
    var stepIdx = 0;
    function step() {
      var s = steps[stepIdx++];
      if (s) { log(s[0], "RUNNING", s[1] + " — " + t.company + " · " + t.role); onStep(s[0], s[1]); }
    }

    step(); // company research
    var text = String(postingText || "").trim();
    if (!t.jobUrl && sourceUrl) t.jobUrl = sourceUrl;
    t.lastResearched = now();
    t.sourceKind = sourceKind || t.sourceKind || "official";
    t.sourceUrl = sourceUrl || t.sourceUrl || "";

    var inferred = false;
    if (text.length < 80) {
      // No reliable posting → role-family knowledge only, clearly labeled.
      inferred = true;
      var role = JP.ROLE_HINTS.detect(t.role || "");
      if (role) {
        text = t.role + " — " + t.company + ".\n\n" +
          "Required skills:\n" + role.core.map(function (c) { return "- " + humanKey(c); }).join("\n") +
          "\n\nPreferred:\n" + role.good.map(function (c) { return "- " + humanKey(c); }).join("\n") +
          "\n\n(No job posting was provided — this outline comes from JobProof role knowledge for " + role.label + " roles, not from the company.)";
      }
    }
    if (text.length < 80) {
      t.research = { ok: false, message: "Not enough information about this target. Paste the official job description (from the company careers page) to research it." };
      log("Company Research Agent", "NEEDS_INPUT", "No reliable source text for " + t.company + " — asked for the posting.");
      return { ok: false, message: t.research.message };
    }

    step(); // requirement analysis — the locked JD engine
    var jd = JP.parseJobDescription(text, { mode: "details", title: t.role, company: t.company, url: t.jobUrl || null });
    t.jdText = text;

    var resume = store.get().resume;
    var structured = resume && resume.structured;
    if (!structured && resume && resume.text) {
      structured = JP.parseResume(resume.text, { fileName: resume.fileName, kind: resume.kind });
      resume.structured = structured; store.save();
    }

    var result = { ok: true, inferred: inferred };
    if (structured) {
      step(); step(); // resume + evidence
      var match = JP.computeMatch(structured, jd);
      JP._lastEvidence = match.evidence;
      var ats = JP.computeATS(structured, jd, match);
      var rewrites = JP.buildRewrites(structured, jd);
      var summaryRewrite = JP.rewriteSummary(structured, jd, match);
      result.match = match.overall;
      result.categories = match.categories;
      result.atsScore = ats.score;
      result.rewriteCount = rewrites.length + (summaryRewrite ? 1 : 0);
      t.lastMatch = match.overall;
    } else {
      result.match = null;
      step(); step();
    }

    step(); // gap agent
    step(); // career agent
    log("Company Research Agent", "COMPLETED", "Target researched: " + t.company + " — " + t.role + (inferred ? " (role knowledge only — no posting supplied)" : " (posting text supplied by you)"));
    t.research = result;
    store.save();
    return result;
  }

  function humanKey(key) {
    return String(key || "").replace(/_/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  /* Requirement list with source labels, straight from the parsed JD. */

  function requirementsOf(t) {
    if (!t.jdText) return [];
    var jd = JP.parseJobDescription(t.jdText, { mode: "details", title: t.role, company: t.company, url: t.jobUrl || null });
    var srcLabel = t.sourceKind === "external" ? "EXTERNAL SOURCE"
      : t.jdText && !t.research.inferred ? "OFFICIAL REQUIREMENT" : "AI-INFERRED";
    var sourceName = t.sourceKind === "external" ? "Source you supplied (external)"
      : t.jdText && !t.research.inferred ? "Posting text you supplied (from the company)"
      : "JobProof role knowledge — no posting supplied";
    var out = [];
    jd.skillMentions.langs.concat(jd.skillMentions.frameworks, jd.skillMentions.tools, jd.skillMentions.ml, jd.skillMentions.domain).forEach(function (m) {
      out.push({ term: m.label, count: m.count, ctx: m.ctx, source: srcLabel, sourceName: sourceName, kind: "skill" });
    });
    jd.requirements.years && out.push({ term: jd.requirements.years.min + "+ years experience", ctx: jd.requirements.years.raw, source: srcLabel, sourceName: sourceName, kind: "experience" });
    jd.requirements.education && jd.requirements.education.level && out.push({ term: jd.requirements.education.level + " (or equivalent)", ctx: jd.requirements.education.context, source: srcLabel, sourceName: sourceName, kind: "education" });
    jd.requirements.certifications.forEach(function (c) {
      out.push({ term: c, ctx: null, source: srcLabel, sourceName: sourceName, kind: "certification" });
    });
    (jd.responsibilities || []).slice(0, 6).forEach(function (r) {
      out.push({ term: r.slice(0, 120), ctx: r, source: srcLabel, sourceName: sourceName, kind: "responsibility" });
    });
    // AI-inferred expectations from the role family — always labeled as inference.
    var role = JP.ROLE_HINTS.detect(t.role || "");
    if (role) {
      out.push({ term: "Depth in " + role.label + " fundamentals", ctx: "Role knowledge for " + role.label + " roles.", source: "AI-INFERRED", sourceName: "JobProof role knowledge", kind: "inferred" });
    }
    return out;
  }

  /* ================= gap analysis: reuse the verifier ledger ================= */

  function targetGaps(t) {
    var d = store.get();
    var res = JP.verifier.computeAll({ resume: d.resume, analysis: d.analysis });
    var reqTerms = requirementsOf(t).filter(function (r) { return r.kind === "skill"; });
    var gaps = { critical: [], partial: [], covered: [] };
    reqTerms.forEach(function (r) {
      var sk = res.skills.find(function (s) { return U.norm(s.name) === U.norm(r.term); });
      var status = sk ? sk.status : "INSUFFICIENT EVIDENCE";
      var item = { term: r.term, status: status, reason: sk ? sk.reason : "Required by the target; no evidence on file for it yet." };
      if (status === "VERIFIED") gaps.covered.push(item);
      else if (status === "PARTIAL") gaps.partial.push(item);
      else gaps.critical.push(item);
    });
    return gaps;
  }

  /* ================= roadmap ================= */

  function buildRoadmap(t) {
    var d = store.get();
    var hasResume = !!(d.resume && d.resume.text);
    var gaps = hasResume ? targetGaps(t) : { critical: [], partial: [], covered: [] };
    var weeks = [];
    weeks.push({
      n: 1, title: "Fix resume",
      items: hasResume
        ? ["Review the highlighted resume changes for this target", "Rewrite weak bullets into action + result (never invent numbers)", "Name the target's required skills you genuinely have"]
        : ["Upload your resume — everything else builds on it"],
    });
    var crit = gaps.critical.slice(0, 3).map(function (g) { return g.term; });
    weeks.push({
      n: 2, title: "Close the critical skill gaps",
      items: crit.length ? crit.map(function (c) { return "Build or collect real evidence for " + c; }) : ["No critical skill gaps detected — keep evidence current"],
    });
    weeks.push({
      n: 3, title: "Build missing evidence",
      items: ["Turn one gap into a mission and complete it with a real artifact", "Document projects on GitHub with a README that explains your contribution"],
    });
    weeks.push({
      n: 4, title: "Interview preparation",
      items: ["Run the target interview prep on this page", "Answer out loud; specifics beat generalities"],
    });
    return weeks;
  }

  /* ================= target-specific missions → existing mission system ================= */

  function createTargetMissions(t) {
    var gaps = targetGaps(t);
    var made = [];
    gaps.critical.slice(0, 3).forEach(function (g) {
      var existing = store.f2().missions.find(function (m) {
        return m.companyId === t.id && m.skill === g.term && m.status !== "Verified";
      });
      if (existing) return;
      var mission = {
        id: uid("mis"),
        companyId: t.id,
        companyName: t.company,
        skill: g.term,
        type: "BUILD",
        title: "Build evidence for " + g.term + " (target: " + t.company + ")",
        why: "Required for " + t.role + " at " + t.company + " — your current evidence is " + g.status.toLowerCase() + ".",
        steps: [
          "Pick one concrete artifact for " + g.term + " (repo, project, or document)",
          "Do the work — a real, small, finished thing beats a big unfinished one",
          "Publish it with a README describing your personal contribution",
          "Submit it as evidence and complete the verification interview",
        ],
        evidenceRequirements: ["GitHub repository or project link", "Short written explanation of what you personally did"],
        estimatedEffort: "1–2 weeks",
        progress: 0,
        status: "Not Started",
        createdAt: now(),
      };
      store.f2().missions.unshift(mission);
      made.push(mission);
    });
    if (made.length) {
      store.save();
      log("Career Agent", "COMPLETED", made.length + " target mission(s) created for " + t.company + " — " + t.role + ".");
    }
    return made;
  }

  /* ================= interview prep (uses existing interview agent mechanics) ================= */

  function prepQuestions(t) {
    var d = store.get();
    var res = JP.verifier.computeAll({ resume: d.resume, analysis: d.analysis });
    var reqs = requirementsOf(t).filter(function (r) { return r.kind === "skill"; }).slice(0, 5);
    var qs = { technical: [], behavioral: [], resume: [], project: [], note: "" };
    reqs.forEach(function (r) {
      var sk = res.skills.find(function (s) { return U.norm(s.name) === U.norm(r.term); });
      var level = sk && sk.status === "VERIFIED" ? "depth" : sk && sk.status === "PARTIAL" ? "reasoning" : "fundamentals";
      var project = null;
      if (d.resume && d.resume.structured) {
        var key = U.norm(r.term);
        project = (d.resume.structured.projects || []).find(function (p) {
          var blob = U.norm([p.name, (p.technologies || []).join(" "), (p.bullets || []).join(" ")].join(" "));
          return blob.indexOf(key) !== -1;
        }) || null;
      }
      qs.technical.push({
        q: level === "depth"
          ? "Teach me the part of " + r.term + " most people get wrong. Why is it tricky?"
          : level === "reasoning"
            ? "Walk me through a specific task you completed with " + r.term + " — step by step."
            : "What does " + r.term + " look like in practice? Describe it like to a teammate.",
        level: level, source: "Generated from the requirements in the posting you supplied.",
      });
      if (project) {
        qs.project.push({
          q: "In \u201C" + (project.name || "your project") + "\u201D, where exactly did " + r.term + " come in — and what did you personally do?",
          source: "Built from your resume project data.",
        });
      } else {
        qs.project.push({
          q: "You list interest in " + r.term + " but no project shows it. What would you build to prove it — and how would you demo it in an interview?",
          source: "Gap between target requirements and your evidence.",
        });
      }
    });
    qs.behavioral = [
      { q: "Tell me about a time your first approach failed. What did you change?", source: "General behavioral practice — not a leaked company question." },
      { q: "Describe a situation where you had to learn something quickly to deliver. How did you do it?", source: "General behavioral practice — not a leaked company question." },
    ];
    qs.resume = [
      { q: "Your resume says \u201C" + firstResumeClaim(d) + "\u201D — defend that line in one minute.", source: "Built from your actual resume text." },
    ];
    qs.note = "Practice questions generated from the target posting and your own evidence. JobProof does not have access to real company interview questions and will never claim to.";
    return qs;
  }

  function firstResumeClaim(d) {
    if (d.resume && d.resume.structured && d.resume.structured.bullets && d.resume.structured.bullets.length) {
      return String(d.resume.structured.bullets[0].text || "").slice(0, 80);
    }
    return "your strongest skill";
  }

  /* ================= resume targeting: highlight + changes ================= */

  /* Change categories: REQUIRED (connected to an explicit target
     requirement), RECOMMENDED (clarity), OPTIONAL (nice to have).
     The rewrite engine is the locked one — it never invents metrics. */

  function computeChanges(t) {
    var d = store.get();
    if (!d.resume || !d.resume.text) return [];
    var structured = d.resume.structured || JP.parseResume(d.resume.text, { fileName: d.resume.fileName, kind: d.resume.kind });
    var jd = JP.parseJobDescription(t.jdText || "", { mode: "details", title: t.role, company: t.company, url: t.jobUrl || null });
    if (!t.jdText) return [];

    JP._lastEvidence = jd && JP._lastEvidence || JP._lastEvidence;
    // Ensure the rewriter sees this target's requirement evidence:
    var match = JP.computeMatch(structured, jd);
    JP._lastEvidence = match.evidence;
    var rewrites = JP.buildRewrites(structured, jd);
    var summaryRewrite = JP.rewriteSummary(structured, jd, match);

    var reqTerms = requirementsOf(t).filter(function (r) { return r.kind === "skill" || r.kind === "experience"; })
      .map(function (r) { return U.norm(r.term); });

    var changes = [];
    rewrites.forEach(function (rw) {
      var touching = reqTerms.some(function (term) {
        return U.norm(rw.before).indexOf(term) !== -1 || U.norm(rw.after).indexOf(term) !== -1;
      });
      changes.push({
        id: uid("chg"),
        before: rw.before,
        after: rw.after,
        why: rw.note,
        category: touching ? "required" : "recommended",
        section: rw.section || null,
      });
    });
    if (summaryRewrite) {
      changes.unshift({
        id: uid("chg"),
        before: summaryRewrite.before,
        after: summaryRewrite.after,
        why: "Summary aligned to this target — same facts, sharper framing.",
        category: "recommended",
        section: "Summary",
      });
    }
    return changes;
  }

  function humanize(text) {
    return JP.humanize ? JP.humanize(text) : text;
  }

  /* Apply accepted changes to a TARGETED COPY. The original resume
     text is never modified. */

  function applyChanges(t, accepted) {
    var d = store.get();
    var text = d.resume.text || "";
    var summaryHandled = false;
    accepted.forEach(function (c) {
      if (c.section === "Summary" && !summaryHandled) {
        if (text.indexOf(c.before) !== -1) text = text.split(c.before).join(c.after);
        summaryHandled = true;
        return;
      }
      if (text.indexOf(c.before) !== -1) text = text.split(c.before).join(c.after);
    });
    text = humanize(text);
    t.targetedResume = { text: text, updatedAt: now(), changes: accepted.map(function (c) { return { before: c.before, after: c.after, why: c.why, category: c.category }; }) };
    store.save();
    log("Humanizer", "COMPLETED", accepted.length + " accepted change(s) applied to the targeted resume copy for " + t.company + ". Original untouched.");
    return t.targetedResume;
  }

  /* ================= scorecard ================= */

  function scorecard(t) {
    var d = store.get();
    if (!d.resume || !d.resume.structured || !t.jdText) return null;
    var jd = JP.parseJobDescription(t.jdText, { mode: "details", title: t.role, company: t.company, url: t.jobUrl || null });
    var match = JP.computeMatch(d.resume.structured, jd);
    var ats = JP.computeATS(d.resume.structured, jd, match);
    var gaps = targetGaps(t);
    var reqCount = gaps.critical.length + gaps.partial.length + gaps.covered.length;
    return {
      requirementCoverage: reqCount ? Math.round((gaps.covered.length / reqCount) * 100) : null,
      evidenceStrength: (match.categories.find(function (c) { return c.key === "evidence"; }) || {}).score,
      resumeRelevance: (match.categories.find(function (c) { return c.key === "responsibilities"; }) || {}).score,
      keywordCoverage: (match.categories.find(function (c) { return c.key === "keywords"; }) || {}).score,
      atsReadability: ats.score,
      match: match.overall,
      disclaimer: "An analytical readiness assessment against the posted requirements — not a prediction of hiring outcome.",
    };
  }

  /* ================= report ================= */

  function buildReport(t) {
    var d = store.get();
    var gaps = targetGaps(t);
    var sc = scorecard(t);
    var missions = store.f2().missions.filter(function (m) { return m.companyId === t.id; });
    var id = "CT-" + new Date().toISOString().slice(0, 10).replace(/-/g, "") + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();
    var L = [];
    L.push("JOBPROOF COMPANY TARGET REPORT");
    L.push("=".repeat(40));
    L.push("");
    L.push("Report ID: " + id);
    L.push("Generated: " + new Date().toLocaleString());
    L.push("Target company: " + t.company);
    L.push("Target role: " + t.role);
    L.push("Target location: " + (t.location || "(not set)"));
    L.push("Experience level: " + (t.level || "(not set)"));
    L.push("Source: " + (t.sourceKind === "external" ? "External source (user-supplied)" : t.jdText ? "Official posting text (user-supplied)" : "Role knowledge only — no posting supplied"));
    if (t.jobUrl) L.push("Posting URL: " + t.jobUrl);
    L.push("Last researched: " + fmtDate(t.lastResearched));
    L.push("");
    L.push("REQUIREMENTS (from the source above — never invented)");
    requirementsOf(t).slice(0, 14).forEach(function (r) {
      L.push("  [" + r.source + "] " + r.term);
    });
    L.push("");
    L.push("USER EVIDENCE STATUS");
    L.push("  Covered: " + (gaps.covered.map(function (g) { return g.term; }).join(", ") || "(none yet)"));
    L.push("  Partial: " + (gaps.partial.map(function (g) { return g.term; }).join(", ") || "(none)"));
    L.push("  Critical gaps: " + (gaps.critical.map(function (g) { return g.term; }).join(", ") || "(none)"));
    L.push("");
    if (sc) {
      L.push("SCORECARD (analytical assessment, not a hiring prediction)");
      L.push("  Requirement coverage: " + sc.requirementCoverage + "%");
      L.push("  Evidence strength: " + sc.evidenceStrength + "/100");
      L.push("  Resume relevance: " + sc.resumeRelevance + "/100");
      L.push("  Keyword coverage: " + sc.keywordCoverage + "%");
      L.push("  ATS readability: " + sc.atsReadability + "/100");
      L.push("  Overall match vs posting: " + sc.match + "%");
      L.push("");
    }
    L.push("RECOMMENDED MISSIONS (" + missions.length + ")");
    missions.forEach(function (m) { L.push("  - [" + m.status + "] " + m.title); });
    L.push("");
    L.push("NEXT ACTION: " + nextAction(t).title);
    L.push("");
    L.push("Every requirement above is traceable to the source text you supplied or is labeled AI-INFERRED. Where evidence was missing, JobProof said so.");
    U.downloadText("JobProof-Company-Target-Report-" + id + ".txt", L.join("\n"));
    f4().targets.forEach(function (x) { if (x.id === t.id) x.lastReportId = id; });
    store.save();
    log("Company Target", "COMPLETED", "Target report " + id + " generated for " + t.company + ".");
    JP.ui.toast("Report downloaded.");
  }

  /* ================= daily next action ================= */

  function nextAction(t) {
    var d = store.get();
    if (!d.resume || !d.resume.text) {
      return { title: "Upload your resume to start company targeting", why: "Every comparison, gap and roadmap needs your actual profile.", kind: "upload" };
    }
    if (!t.jdText) {
      return { title: "Paste the official job description for this target", why: "Requirement research needs the real posting — JobProof will not guess it.", kind: "research" };
    }
    var gaps = targetGaps(t);
    if (gaps.critical.length) {
      var m = store.f2().missions.find(function (x) { return x.companyId === t.id && x.skill === gaps.critical[0].term && x.status !== "Verified"; });
      if (m && m.status === "Not Started") return { title: "Start mission: " + m.title, why: m.why, kind: "mission", missionId: m.id };
      if (!m) {
        var made = createTargetMissions(t);
        if (made.length) return { title: "Start mission: " + made[0].title, why: made[0].why, kind: "mission", missionId: made[0].id };
      }
      return { title: "Continue your " + gaps.critical[0].term + " evidence mission", why: "It is the highest-priority gap for this target.", kind: "mission" };
    }
    if (gaps.partial.length) {
      return { title: "Strengthen partial evidence for " + gaps.partial[0].term, why: "PARTIAL evidence is a risk in interviews — validate it (Proof Center interview or a stronger artifact).", kind: "interview" };
    }
    return { title: "Run the verification interview for this target", why: "All requirements have evidence — validate the partial ones and keep the ledger current.", kind: "interview" };
  }

  /* ================= rendering ================= */

  function render() {
    var root = $("target-root");
    if (!root) return;
    var t = activeTarget();
    if (!t) { root.innerHTML = emptyHtml(); wireEmpty(); return; }
    var tabs = [
      ["overview", "Overview"],
      ["requirements", "Requirements"],
      ["gaps", "My Match & Gaps"],
      ["resume", "Resume Targeting"],
      ["interview", "Interview Prep"],
      ["roadmap", "Roadmap"],
    ];
    var html = '<h1 class="screen-title">Company Target</h1>' +
      targetHeader(t) +
      '<div class="tabbar" role="tablist" aria-label="Company Target sections">' +
      tabs.map(function (tb) {
        return '<button class="tab-btn' + (activeTab === tb[0] ? " is-active" : "") + '" data-tab="' + tb[0] + '" role="tab" aria-selected="' + (activeTab === tb[0]) + '" type="button">' + tb[1] + "</button>";
      }).join("") + "</div>" +
      '<div id="target-body"></div>';
    root.innerHTML = html;
    renderTab();
    root.querySelectorAll(".tab-btn").forEach(function (b) {
      b.addEventListener("click", function () { activeTab = b.dataset.tab; render(); });
    });
    wireHeader();
  }

  function targetHeader(t) {
    var na = nextAction(t);
    return '<div class="card ct-head">' +
      '<div class="ct-head-main">' +
      '<p class="readiness-label">Target company</p>' +
      '<p class="readiness-role">' + esc(t.company) + "</p>" +
      '<p class="ct-head-sub">' + esc(t.role) + (t.location ? " — " + esc(t.location) : "") + (t.level ? " · " + esc(t.level) : "") + "</p>" +
      '<p class="muted">Source: ' + esc(sourceLabel(t)) + " · Last researched: " + esc(t.lastResearched ? fmtDate(t.lastResearched) : "never") + "</p>" +
      "</div>" +
      '<div class="ct-head-side">' +
      '<p class="readiness-label">Your next action</p>' +
      '<p class="ct-next-title">' + esc(na.title) + "</p>" +
      '<p class="muted">' + esc(na.why) + "</p>" +
      '<button class="btn btn-primary btn-sm" id="ct-next-go" type="button">Do it</button>' +
      "</div></div>";
  }

  function sourceLabel(t) {
    if (t.jdText && t.sourceKind === "external") return "external source you supplied";
    if (t.jdText) return "posting text you supplied — marked official";
    if (t.jobUrl) return "posting URL (text not captured)";
    return "role knowledge only — no posting yet";
  }

  function wireHeader() {
    var go = $("ct-next-go");
    if (go) go.addEventListener("click", function () {
      var t = activeTarget(); if (!t) return;
      var na = nextAction(t);
      if (na.kind === "upload") { JP.app.showView("home"); return; }
      if (na.kind === "research") { activeTab = "overview"; render(); return; }
      if (na.kind === "mission") { JP.app.showView("career"); return; }
      if (na.kind === "interview") { JP.app.showView("proof"); return; }
    });
  }

  function renderTab() {
    var t = activeTarget();
    var body = $("target-body");
    if (!body || !t) return;
    if (activeTab === "overview") body.innerHTML = overviewHtml(t);
    else if (activeTab === "requirements") body.innerHTML = requirementsHtml(t);
    else if (activeTab === "gaps") body.innerHTML = gapsHtml(t);
    else if (activeTab === "resume") { body.innerHTML = resumeHtml(t); wireResumeTab(t); }
    else if (activeTab === "interview") body.innerHTML = interviewHtml(t);
    else if (activeTab === "roadmap") body.innerHTML = roadmapHtml(t);
  }

  /* ---- empty state ---- */

  function emptyHtml() {
    var saved = allTargets();
    return '<h1 class="screen-title">Company Target</h1>' +
      '<div class="card">' +
      '<h2 class="card-title">Choose a company and role to create your target</h2>' +
      '<p class="card-sub">JobProof builds a preparation system around one specific company + role. Requirements come from the job posting you supply (official careers text works best) — never from guesswork.</p>' +
      targetFormHtml() +
      "</div>" +
      (saved.length ? '<h2 class="screen-subtitle">Your saved targets</h2>' + saved.map(function (t) {
        return '<div class="card job-row" data-id="' + esc(t.id) + '"><div class="job-row-main">' +
          '<p class="job-row-title">' + esc(t.company) + " · " + esc(t.role) + "</p>" +
          '<p class="muted">' + esc(t.location || "location not set") + " · last researched " + esc(t.lastResearched ? fmtDate(t.lastResearched) : "never") + "</p>" +
          "</div>" +
          '<span class="status-pill ' + (t.lastMatch != null ? "is-progress" : "is-todo") + '">' + (t.lastMatch != null ? t.lastMatch + "% match" : "Not researched") + "</span>" +
          '<div class="blocker-actions"><button class="btn btn-secondary btn-sm" data-act="open">Open</button>' +
          '<button class="btn btn-ghost btn-sm" data-act="delete">Delete</button></div></div>';
      }).join("") : "");
  }

  function targetFormHtml() {
    return '<div class="ct-form">' +
      '<div class="fld-row">' +
      '<label class="fld"><span>Company</span><input id="ct-company" type="text" placeholder="e.g. Google" /></label>' +
      '<label class="fld"><span>Target role</span><input id="ct-role" type="text" placeholder="e.g. Software Engineer" /></label>' +
      "</div>" +
      '<div class="fld-row">' +
      '<label class="fld"><span>Location (optional)</span><input id="ct-location" type="text" placeholder="e.g. Bengaluru, India" /></label>' +
      '<label class="fld"><span>Experience level</span><select id="ct-level"><option>Student</option><option>Early Career / Entry Level</option><option>Mid Level</option><option>Senior</option></select></label>' +
      "</div>" +
      '<label class="fld"><span>Job posting URL (optional)</span><input id="ct-url" type="url" placeholder="https://… careers page or posting" /></label>' +
      '<label class="fld"><span>Paste the official job description</span><textarea id="ct-posting" rows="6" placeholder="Copy the full posting from the company careers page. Required and preferred qualifications, responsibilities. If you skip this, JobProof uses labeled role knowledge instead — clearly marked as inference."></textarea></label>' +
      '<label class="fld"><span>Where is this text from?</span><select id="ct-srckind"><option value="official">Official company careers page / posting</option><option value="external">Job board or other external source</option></select></label>' +
      '<div class="blocker-actions"><button class="btn btn-primary" id="ct-create" type="button">Create target &amp; research it</button></div>' +
      '<p class="form-err" id="ct-err" hidden></p>' +
      "</div>";
  }

  function wireEmpty() {
    var root = $("target-root");
    root.querySelectorAll(".job-row [data-act]").forEach(function (b) {
      b.addEventListener("click", function () {
        var id = b.closest(".job-row").getAttribute("data-id");
        if (b.dataset.act === "open") { f4().activeId = id; store.save(); render(); return; }
        if (b.dataset.act === "delete") {
          var f = f4();
          f.targets = f.targets.filter(function (x) { return x.id !== id; });
          if (f.activeId === id) f.activeId = f.targets.length ? f.targets[0].id : null;
          store.save(); render();
        }
      });
    });
    var create = $("ct-create");
    if (create) create.addEventListener("click", function () {
      var err = $("ct-err"); err.hidden = true;
      var company = ($("ct-company").value || "").trim();
      var role = ($("ct-role").value || "").trim();
      if (!company || !role) { err.textContent = "Company and role are required."; err.hidden = false; return; }
      var t = {
        id: uid("ct"), company: company, role: role,
        location: ($("ct-location").value || "").trim(),
        level: $("ct-level").value,
        jobUrl: ($("ct-url").value || "").trim() || null,
        createdAt: now(), lastResearched: null, sourceKind: $("ct-srckind").value,
        jdText: null, research: null, lastMatch: null, targetedResume: null,
      };
      if (t.jobUrl && !/^https?:\/\//i.test(t.jobUrl)) { err.textContent = "The URL must start with http:// or https://"; err.hidden = false; return; }
      allTargets().unshift(t);
      f4().activeId = t.id;
      var res = researchTarget(t, ($("ct-posting").value || "").trim(), t.sourceKind, t.jobUrl, function (agent, doing) {
        log(agent, "RUNNING", doing);
      });
      store.save();
      activeTab = "overview";
      render();
      if (!res.ok) { JP.ui.toast("Target created — paste the posting to complete research."); }
      else { JP.ui.toast("Target researched" + (res.match != null ? " — " + res.match + "% match to this posting." : ".")); }
    });
  }

  /* ---- overview tab ---- */

  function overviewHtml(t) {
    var d = store.get();
    var na = nextAction(t);
    var sc = scorecard(t);
    var html = "";
    if (!t.jdText) {
      html += '<div class="card"><h2 class="card-title">Research needed</h2>' +
        '<p class="muted">' + esc(t.research && t.research.message ? t.research.message : "No posting text yet — JobProof will not guess company requirements.") + "</p>" +
        '<div class="blocker-actions"><button class="btn btn-secondary btn-sm" data-goto="requirements">Add the posting</button></div></div>';
    }
    html += '<div class="card"><h2 class="card-title">Role overview</h2>' +
      "<ul>" +
      "<li><strong>Target company:</strong> " + esc(t.company) + "</li>" +
      "<li><strong>Target role:</strong> " + esc(t.role) + "</li>" +
      "<li><strong>Location:</strong> " + esc(t.location || "Not enough evidence to determine this.") + "</li>" +
      "<li><strong>Experience level:</strong> " + esc(t.level || "Not set") + "</li>" +
      "<li><strong>Job source:</strong> " + esc(sourceLabel(t)) + "</li>" +
      (t.jobUrl ? '<li><strong>Source link:</strong> <a href="' + esc(t.jobUrl) + '" target="_blank" rel="noopener noreferrer">open posting</a></li>' : "") +
      "<li><strong>Last researched:</strong> " + esc(t.lastResearched ? fmtDate(t.lastResearched) : "never") + "</li>" +
      "</ul>" +
      '<div class="blocker-actions">' +
      '<button class="btn btn-ghost btn-sm" id="ct-refresh" type="button">Refresh research</button>' +
      '<button class="btn btn-ghost btn-sm" data-goto="requirements" type="button">Update source text</button>' +
      "</div></div>";

    if (sc) {
      html += '<div class="card"><h2 class="card-title">Targeted resume scorecard</h2>' +
        '<p class="card-sub">' + esc(sc.disclaimer) + "</p>" +
        '<div class="proof-counts">' +
        scCell("Requirement coverage", sc.requirementCoverage != null ? sc.requirementCoverage + "%" : "—") +
        scCell("Evidence strength", sc.evidenceStrength != null ? sc.evidenceStrength + "/100" : "—") +
        scCell("Keyword coverage", sc.keywordCoverage != null ? sc.keywordCoverage + "%" : "—") +
        scCell("ATS readability", sc.atsReadability != null ? sc.atsReadability + "/100" : "—") +
        "</div></div>";
    }

    html += '<div class="card"><h2 class="card-title">What this role appears to value</h2>' +
      '<p class="card-sub">AI-INFERRED FROM ROLE DESCRIPTION — theme-level reading of the posting you supplied, not company policy.</p><ul>' +
      valueThemes(t).map(function (v) { return "<li>" + esc(v) + "</li>"; }).join("") +
      "</ul></div>";

    html += '<div class="card agent-card"><h2 class="card-title">Daily next action</h2>' +
      '<div class="agent-next"><p class="agent-next-title">' + esc(na.title) + "</p>" +
      '<p class="muted">' + esc(na.why) + "</p>" +
      '<button class="btn btn-primary btn-sm" id="ct-next-go2" type="button">Do it</button></div></div>';

    html += '<div class="card"><h2 class="card-title">Target report</h2>' +
      '<p class="muted">Full Company Target Report with sources, requirements, evidence, gaps, missions and next actions.</p>' +
      '<button class="btn btn-secondary btn-sm" id="ct-report" type="button">Generate report</button></div>';

    setTimeout(function () {
      var r = $("ct-refresh"); if (r) r.addEventListener("click", function () { refreshResearch(t); });
      var rp = $("ct-report"); if (rp) rp.addEventListener("click", function () { buildReport(t); });
      var g2 = $("ct-next-go2"); if (g2) g2.addEventListener("click", function () { wireHeader(); var go = $("ct-next-go"); if (go) go.click(); });
      document.querySelectorAll("#target-root [data-goto]").forEach(function (b) {
        b.addEventListener("click", function () { activeTab = b.dataset.goto; render(); });
      });
    }, 0);
    return html;
  }

  function scCell(label, value) {
    return '<div><p class="proof-num">' + esc(value) + "</p><p class=\"muted\">" + esc(label) + "</p></div>";
  }

  function valueThemes(t) {
    if (!t.jdText) return ["No posting supplied yet — nothing to infer from."];
    var jd = JP.parseJobDescription(t.jdText, { title: t.role, company: t.company });
    var themes = [];
    if (jd.softSkills && jd.softSkills.length) themes.push("Collaboration signals mentioned: " + jd.softSkills.slice(0, 4).join(", ") + ".");
    (jd.responsibilities || []).slice(0, 3).forEach(function (r) {
      themes.push("Expected to: " + String(r).replace(/^[-•*\u2022]\s*/, "").slice(0, 110) + ".");
    });
    if (jd.requirements.years) themes.push("Experience bar stated in the posting: " + jd.requirements.years.min + "+ years.");
    if (!themes.length) themes.push("The posting emphasizes concrete skills over themes — see the Requirements tab.");
    return themes;
  }

  function refreshResearch(t) {
    if (!t.jdText) { JP.ui.toast("Paste the posting text first — refresh re-reads the source you supplied."); activeTab = "overview"; render(); return; }
    var res = researchTarget(t, t.jdText, t.sourceKind, t.jobUrl);
    store.save();
    render();
    JP.ui.toast(res.ok ? "Research refreshed from your saved source text (" + fmtDate(t.lastResearched) + ")." : "Research failed — source text too short.");
  }

  /* ---- requirements tab ---- */

  function requirementsHtml(t) {
    var reqs = requirementsOf(t);
    var html = '<div class="card"><h2 class="card-title">Company & role requirements</h2>' +
      '<p class="card-sub">Every line is labeled by where it came from. Update the source text any time — JobProof re-reads it on refresh.</p>' +
      '<div class="ct-editor">' +
      '<label class="fld"><span>Official / source job description</span><textarea id="ct-jd-edit" rows="8">' + esc(t.jdText || "") + "</textarea></label>" +
      '<div class="fld-row">' +
      '<label class="fld"><span>Source kind</span><select id="ct-jd-srckind"><option value="official"' + (t.sourceKind !== "external" ? " selected" : "") + ">Official company posting</option><option value=\"external\"" + (t.sourceKind === "external" ? " selected" : "") + ">External source</option></select></label>" +
      '<label class="fld"><span>Posting URL (optional)</span><input id="ct-jd-url" type="url" value="' + esc(t.jobUrl || "") + '" placeholder="https://…" /></label>' +
      "</div>" +
      '<button class="btn btn-primary btn-sm" id="ct-jd-save" type="button">Save source &amp; re-research</button>' +
      "</div></div>";

    if (!reqs.length) {
      return html + '<div class="card"><p class="muted">No requirements extracted yet — save a posting above.</p></div>';
    }
    var groups = { skill: [], experience: [], education: [], certification: [], responsibility: [], inferred: [] };
    reqs.forEach(function (r) { (groups[r.kind] || groups.skill).push(r); });
    html += '<div class="card"><div class="card-label-row"><h2 class="card-title">Extracted requirements</h2>' +
      '<span class="ai-pill">' + (t.sourceKind === "external" ? "EXTERNAL SOURCE" : "OFFICIAL REQUIREMENT") + "</span></div>";
    Object.keys(groups).forEach(function (k) {
      if (!groups[k].length) return;
      var title = { skill: "Skills", experience: "Experience", education: "Education", certification: "Certifications", responsibility: "Responsibilities", inferred: "AI-inferred expectations" }[k];
      html += '<h3 class="sub-title">' + title + "</h3><ul>";
      groups[k].forEach(function (r) {
        html += '<li><span class="src-pill ' + (r.source === "AI-INFERRED" ? "is-inferred" : "is-official") + '">' + esc(r.source) + "</span> " + esc(r.term) +
          (r.ctx ? ' <span class="muted">— \u201C' + esc(String(r.ctx).slice(0, 110)) + "\u201D</span>" : "") + "</li>";
      });
      html += "</ul>";
    });
    html += "</div>";
    setTimeout(function () {
      var save = $("ct-jd-save");
      if (save) save.addEventListener("click", function () {
        var text = ($("ct-jd-edit").value || "").trim();
        t.sourceKind = $("ct-jd-srckind").value;
        t.jobUrl = ($("ct-jd-url").value || "").trim() || null;
        var res = researchTarget(t, text, t.sourceKind, t.jobUrl);
        store.save(); render();
        JP.ui.toast(res.ok ? "Source saved and re-researched." : res.message);
      });
    }, 0);
    return html;
  }

  /* ---- gaps tab ---- */

  function gapsHtml(t) {
    var d = store.get();
    if (!d.resume || !d.resume.text) {
      return '<div class="empty-state"><p><strong>Upload your resume to start company targeting.</strong></p><p class="muted">The match compares your actual evidence to the target requirements.</p><button class="btn btn-primary" id="ct-upload-go" type="button">Go to upload</button></div>';
    }
    if (!t.jdText) {
      return '<div class="empty-state"><p><strong>No source posting yet.</strong></p><p class="muted">Add the official job description on the Requirements tab to compute the match.</p></div>';
    }
    var gaps = targetGaps(t);
    var sc = scorecard(t);
    var html = '<div class="card"><div class="card-label-row"><h2 class="card-title">My match to this company + role</h2>' +
      (sc ? '<span class="status-pill is-progress">' + sc.match + "% match</span>" : "") + "</div>" +
      '<p class="card-sub">Computed by the same match engine used on the Job Match page — run against this target\u2019s posting.</p></div>';

    function gapSection(title, cls, arr, why) {
      if (!arr.length) return "";
      return '<div class="card"><h2 class="card-title">' + title + "</h2>" + arr.map(function (g) {
        return '<div class="blocker"><p class="blocker-title"><span class="ct-gap-dot ' + cls + '"></span> ' + esc(g.term) +
          ' <span class="status-pill ' + (g.status === "VERIFIED" ? "is-verified" : g.status === "PARTIAL" ? "is-part" : "is-miss") + '">' + esc(g.status) + "</span></p>" +
          '<p class="muted">' + esc(g.reason) + "</p>" +
          '<p class="blocker-evidence"><strong>' + why + "</strong> " + esc(gapAdvice(g)) + "</p>" +
          '<div class="blocker-actions">' +
          '<button class="btn btn-secondary btn-sm" data-mission="' + esc(g.term) + '" type="button">Create mission</button>' +
          '<button class="btn btn-ghost btn-sm" data-evidence="' + esc(g.term) + '" type="button">Add evidence</button>' +
          "</div></div>";
      }).join("") + "</div>";
    }
    html += gapSection("Critical gaps", "dot-critical", gaps.critical, "NOW WHAT?");
    html += gapSection("Partial gaps", "dot-partial", gaps.partial, "WHY?");
    html += gapSection("Covered", "dot-covered", gaps.covered, "EVIDENCE:");

    setTimeout(function () {
      document.querySelectorAll("#target-root [data-mission]").forEach(function (b) {
        b.addEventListener("click", function () {
          var term = b.getAttribute("data-mission");
          var made = createTargetMissionsFor(t, term);
          JP.ui.toast(made.length ? "Mission created — see Missions." : "A mission for this skill already exists.");
          if (made.length) JP.app.showView("career");
        });
      });
      document.querySelectorAll("#target-root [data-evidence]").forEach(function (b) {
        b.addEventListener("click", function () {
          JP.modals.openEvidence(b.getAttribute("data-evidence"), function () { render(); });
        });
      });
      var up = $("ct-upload-go");
      if (up) up.addEventListener("click", function () { JP.app.showView("home"); });
    }, 0);
    return html;
  }

  function createTargetMissionsFor(t, term) {
    var made = [];
    var existing = store.f2().missions.find(function (m) { return m.companyId === t.id && m.skill === term && m.status !== "Verified"; });
    if (existing) return made;
    var mission = {
      id: uid("mis"), companyId: t.id, companyName: t.company, skill: term, type: "BUILD",
      title: "Build evidence for " + term + " (target: " + t.company + ")",
      why: "Required for " + t.role + " at " + t.company + ".",
      steps: ["Pick one concrete artifact for " + term, "Do the work", "Publish with a README describing your contribution", "Submit as evidence + verification interview"],
      evidenceRequirements: ["GitHub repository or project link", "Written explanation of your personal contribution"],
      estimatedEffort: "1–2 weeks", progress: 0, status: "Not Started", createdAt: now(),
    };
    store.f2().missions.unshift(mission);
    made.push(mission);
    store.save();
    log("Career Agent", "COMPLETED", "Target mission created: " + mission.title);
    return made;
  }

  function gapAdvice(g) {
    if (g.status === "VERIFIED") return "Keep the artifact current — re-verification keeps the ledger honest.";
    if (g.status === "PARTIAL") return "Add stronger evidence (inspectable artifact) or run the verification interview.";
    return "Build one small, real, finished artifact and submit it as evidence.";
  }

  /* ---- resume targeting tab (inline highlighting + accept/edit/reject) ---- */

  function resumeHtml(t) {
    var d = store.get();
    if (!d.resume || !d.resume.text) {
      return '<div class="empty-state"><p><strong>Upload your resume to start company targeting.</strong></p><button class="btn btn-primary" id="ct-upload-go2" type="button">Go to upload</button></div>';
    }
    if (!t.jdText) {
      return '<div class="empty-state"><p><strong>Add the target posting first (Requirements tab).</strong></p><p class="muted">Highlighting is computed against the target\u2019s real requirements.</p></div>';
    }

    var changes = computeChanges(t);
    var counts = {
      required: changes.filter(function (c) { return c.category === "required"; }).length,
      recommended: changes.filter(function (c) { return c.category === "recommended"; }).length,
      optional: changes.filter(function (c) { return c.category === "optional"; }).length,
    };
    var decisions = t.changeDecisions || (t.changeDecisions = {});

    var html = '<div class="card"><div class="card-label-row"><h2 class="card-title">Resume changes</h2>' +
      '<span class="muted">' + changes.length + " recommended · " + counts.required + " required</span></div>" +
      '<p class="card-sub">Highlighted against the target\u2019s requirements. The original resume is never modified — accepted changes build a separate targeted copy.</p>' +
      '<div class="blocker-actions">' +
      '<button class="btn btn-secondary btn-sm" id="ct-accept-safe" type="button">Accept all safe changes</button>' +
      '<button class="btn btn-ghost btn-sm" id="ct-apply" type="button">Build targeted version</button>' +
      "</div></div>";

    // Inline highlighted resume (original with marks)
    html += '<div class="card"><h2 class="card-title">Where your resume needs to change</h2>' +
      '<p class="muted">' + highlightLegend() + "</p>" +
      '<div class="ct-resume-view">' + highlightedResume(d.resume.text, changes) + "</div></div>";

    html += '<h2 class="screen-subtitle">Suggested changes</h2>';
    if (!changes.length) {
      html += '<div class="card"><p class="muted">No honest rewrites available for this target — the rewriter offers nothing rather than inventing content.</p></div>';
    }
    changes.forEach(function (c, i) {
      var dec = decisions[c.before] || "pending";
      html += '<div class="card ba-block" data-chg="' + i + '">' +
        '<span class="src-pill ' + (c.category === "required" ? "is-required" : c.category === "recommended" ? "is-recommended" : "is-optional") + '">' +
        (c.category === "required" ? "REQUIRED CHANGE" : c.category === "recommended" ? "RECOMMENDED CHANGE" : "OPTIONAL CHANGE") + "</span>" +
        '<p class="ba-label">BEFORE</p><p class="ba-text">' + esc(c.before) + "</p>" +
        '<p class="ba-label">AFTER</p><p class="ba-text ba-after">' + esc(c.after) + "</p>" +
        '<p class="muted"><strong>Why:</strong> ' + esc(c.why) + "</p>" +
        '<p class="muted"><strong>Evidence used:</strong> facts already present in your resume — no metrics, employers or outcomes were added.</p>' +
        '<div class="blocker-actions">' +
        '<button class="btn btn-secondary btn-sm" data-c="accept" ' + (dec === "accepted" ? "disabled" : "") + ">Accept</button>" +
        '<button class="btn btn-secondary btn-sm" data-c="edit">Edit yourself</button>' +
        '<button class="btn btn-ghost btn-sm" data-c="reject" ' + (dec === "rejected" ? "disabled" : "") + ">Reject</button>" +
        '<span class="status-pill ' + (dec === "accepted" ? "is-verified" : dec === "rejected" ? "is-miss" : "is-todo") + '">' +
        (dec === "accepted" ? "Accepted" : dec === "rejected" ? "Rejected" : "Pending") + "</span>" +
        "</div></div>";
    });

    if (t.targetedResume) {
      html += '<div class="card"><div class="card-label-row"><h2 class="card-title">Targeted version</h2>' +
        '<span class="muted">built ' + fmtDate(t.targetedResume.updatedAt) + "</span></div>" +
        '<p class="card-sub">A separate copy — original stays untouched. Both live side by side.</p>' +
        '<details class="ct-details"><summary>View targeted resume text</summary><pre class="ct-pre">' + esc(t.targetedResume.text) + "</pre></details>" +
        '<div class="blocker-actions"><button class="btn btn-secondary btn-sm" id="ct-copy-targeted" type="button">Copy text</button></div></div>';
    }

    setTimeout(function () { wireResumeTab(t); }, 0);
    return html;
  }

  function highlightLegend() {
    return '<span class="hl hl-weak">weak / generic wording</span> <span class="hl hl-req">touches a required target skill</span> <span class="hl hl-strong">strong evidence</span>';
  }

  /* Wrap bullets that have suggested changes with a clickable mark. */

  function highlightedResume(text, changes) {
    var esc2 = esc;
    var lines = String(text || "").split("\n");
    var befores = changes.map(function (c) { return c.before; });
    return lines.map(function (line) {
      var e = esc2(line);
      var hitIdx = -1;
      befores.forEach(function (b, i) {
        if (hitIdx === -1 && line.trim() && line.trim().indexOf(b.trim()) !== -1) hitIdx = i;
      });
      if (hitIdx !== -1) {
        var ch = changes[hitIdx];
        var cls = ch.category === "required" ? "hl-req" : "hl-weak";
        return '<mark class="hl ' + cls + '" data-hl="' + hitIdx + '" title="Click for details">' + e.trim() + "</mark>";
      }
      var trimmed = line.trim();
      if (/^[A-Z][a-z]+ed\b/.test(trimmed) && /(\d|percent|%|\$)/.test(trimmed)) return '<span class="hl hl-strong">' + e + "</span>";
      return e;
    }).join("\n");
  }

  function wireResumeTab(t) {
    var root = $("target-root");
    var decisions = t.changeDecisions || (t.changeDecisions = {});
    var changes = computeChanges(t);

    root.querySelectorAll("mark[data-hl]").forEach(function (m) {
      m.addEventListener("click", function () {
        var idx = parseInt(m.getAttribute("data-hl"), 10);
        var ch = changes[idx];
        if (!ch) return;
        JP.ui.openEditModal(ch.after, function () {}); // reuse edit modal as detail view is overkill; open change card instead
        var block = root.querySelector('[data-chg="' + idx + '"]');
        if (block) block.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    });

    root.querySelectorAll('.ba-block [data-c]').forEach(function (b) {
      b.addEventListener("click", function () {
        var i = parseInt(b.closest(".ba-block").getAttribute("data-chg"), 10);
        var ch = changes[i];
        if (!ch) return;
        var act = b.dataset.c;
        if (act === "accept") { decisions[ch.before] = "accepted"; }
        else if (act === "reject") { decisions[ch.before] = "rejected"; }
        else if (act === "edit") {
          JP.ui.openEditModal(ch.after, function (val) {
            if (val && val.trim()) { ch.after = val.trim(); decisions[ch.before] = "accepted"; }
            store.save(); render();
          });
          return;
        }
        store.save(); render();
      });
    });

    var safe = $("ct-accept-safe");
    if (safe) safe.addEventListener("click", function () {
      changes.forEach(function (c) {
        if (decisions[c.before] !== "rejected") decisions[c.before] = "accepted";
      });
      store.save(); render();
      JP.ui.toast("Safe changes accepted (rejected ones stay rejected). Build the targeted version when ready.");
    });

    var apply = $("ct-apply");
    if (apply) apply.addEventListener("click", function () {
      var accepted = changes.filter(function (c) { return decisions[c.before] === "accepted"; });
      if (!accepted.length) { JP.ui.toast("Accept at least one change first."); return; }
      applyChanges(t, accepted);
      render();
      JP.ui.toast("Targeted version built — original preserved.");
    });

    var copy = $("ct-copy-targeted");
    if (copy) copy.addEventListener("click", function () {
      if (U.copyText) U.copyText(t.targetedResume.text);
      JP.ui.toast("Targeted resume text copied.");
    });

    var up2 = $("ct-upload-go2");
    if (up2) up2.addEventListener("click", function () { JP.app.showView("home"); });
  }

  /* ---- interview prep tab ---- */

  function interviewHtml(t) {
    var qs = prepQuestions(t);
    var html = '<div class="card"><h2 class="card-title">Interview preparation — ' + esc(t.company) + " · " + esc(t.role) + "</h2>" +
      '<p class="card-sub">' + esc(qs.note) + "</p></div>";
    function qSection(title, arr) {
      if (!arr || !arr.length) return "";
      return '<div class="card"><h2 class="card-title">' + title + "</h2>" + arr.map(function (x) {
        return '<div class="blocker"><p class="interview-q">' + esc(x.q) + "</p>" +
          '<p class="muted"><span class="src-pill is-inferred">SOURCE</span> ' + esc(x.source) + "</p></div>";
      }).join("") + "</div>";
    }
    html += qSection("Technical", qs.technical);
    html += qSection("Project-based", qs.project);
    html += qSection("Behavioral", qs.behavioral);
    html += qSection("Resume-based", qs.resume);
    html += '<div class="card"><h2 class="card-title">Validate for real</h2>' +
      '<p class="muted">Practice here, then take the adaptive verification interview in the Proof Center — strong answers become interview evidence in your ledger.</p>' +
      '<button class="btn btn-primary btn-sm" id="ct-go-proof" type="button">Open Proof Center</button></div>';
    setTimeout(function () {
      var b = $("ct-go-proof");
      if (b) b.addEventListener("click", function () { JP.app.showView("proof"); });
    }, 0);
    return html;
  }

  /* ---- roadmap tab ---- */

  function roadmapHtml(t) {
    var weeks = buildRoadmap(t);
    var html = '<div class="card"><h2 class="card-title">Preparation roadmap</h2>' +
      '<p class="card-sub">Four working weeks, generated from this target\u2019s requirements and your actual evidence. Completing it improves demonstrable readiness — it is not a promise of any hiring outcome.</p></div>' +
      weeks.map(function (w) {
        return '<div class="card"><div class="card-label-row"><h2 class="card-title">Week ' + w.n + " — " + esc(w.title) + "</h2>" +
          '<span class="status-pill is-todo">Week ' + w.n + "</span></div><ul>" +
          w.items.map(function (i) { return "<li>" + esc(i) + "</li>"; }).join("") + "</ul></div>";
      }).join("");
    html += '<div class="card"><h2 class="card-title">Re-verify after missions</h2>' +
      '<p class="muted">When a mission completes, the Evidence Engine re-runs the ledger, gaps update, and this target\u2019s next action changes automatically. Re-run research after updating the posting.</p>' +
      '<div class="blocker-actions">' +
      '<button class="btn btn-secondary btn-sm" id="ct-refresh2" type="button">Refresh research</button>' +
      '<button class="btn btn-secondary btn-sm" id="ct-reverify" type="button">Re-evaluate target now</button>' +
      "</div></div>";
    setTimeout(function () {
      var r2 = $("ct-refresh2"); if (r2) r2.addEventListener("click", function () { refreshResearch(t); });
      var rv = $("ct-reverify"); if (rv) rv.addEventListener("click", function () {
        store.f2().gaps = []; /* force ledger recompute on next read */
        JP.verifier.computeAll({ resume: store.get().resume, analysis: store.get().analysis });
        render();
        JP.ui.toast("Target re-evaluated from current evidence.");
      });
    }, 0);
    return html;
  }

  /* ================= public API ================= */

  JP.company = {
    render: render,
    activeTarget: activeTarget,
    allTargets: allTargets,
    requirementsOf: requirementsOf,
    targetGaps: targetGaps,
    nextAction: nextAction,
    scorecard: scorecard,
    researchTarget: researchTarget,
    createTargetMissions: createTargetMissions,
    buildReport: buildReport,
  };

  /* "Train for this target" hook: called from Job Match when the current
     job matches a company. Additive integration. */
  JP.company.fromCurrentJob = function () {
    var d = store.get();
    if (!d.job || !d.job.text) { JP.ui.toast("Analyze a job first, then train for it as a target."); return; }
    var jd = JP.parseJobDescription(d.job.text, { title: d.job.title || null, company: d.job.company || null });
    var company = d.job.company || jd.company || null;
    var role = d.job.title || jd.title || null;
    // Paste-mode jobs store no title/company; the header line usually
    // carries them ("Role, Level — Company — Location.").
    if (!role || !company) {
      var firstLine = String(d.job.text).split(/\r?\n/)[0].trim().replace(/[.]$/, "");
      var parts = firstLine.split(/[—–|]/).map(function (s) { return s.trim(); }).filter(Boolean);
      if (!role && parts.length) {
        var candidate = parts[0].replace(/\s*,\s*(early career|entry level|intern|junior|senior)\s*$/i, "");
        if (candidate.length <= 70) role = candidate;
      }
      if (!company && parts.length >= 2) company = parts[1];
    }
    company = company || "Target company";
    role = role || "Target role";
    var t = {
      id: uid("ct"), company: company, role: role,
      location: "", level: "Early Career / Entry Level", jobUrl: d.job.url || null,
      createdAt: now(), lastResearched: null, sourceKind: "official", jdText: null,
      research: null, lastMatch: null, targetedResume: null,
    };
    allTargets().unshift(t);
    f4().activeId = t.id;
    researchTarget(t, d.job.text, "official", d.job.url || null);
    store.save();
    JP.app.showView("target");
  };
})();
