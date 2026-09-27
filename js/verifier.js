/* ============================================================
   JobProof AI — js/verifier.js
   The Evidence Engine's core. Separates CLAIM vs EVIDENCE vs
   VERIFICATION. Never promotes a claim to VERIFIED without
   evidence a reviewer can point at. Writes verification history
   so status changes stay traceable over time.
   ============================================================ */

(function () {
  "use strict";

  var JP = window.JP;
  var U = JP.util;
  var store = JP.store;

  var STATUSES = ["VERIFIED", "PARTIAL", "NOT VERIFIED", "INSUFFICIENT EVIDENCE"];

  /* ---------- evidence strength weights ----------
     Each evidence item contributes `strength` (0–2) toward the
     skill's status. Practical > validation > learning > assertion.
     Interview items carry the strength of their actual assessment. */

  var WEIGHTS = {
    github: 1.6,       // public code the system could actually inspect
    project: 1.6,      // project URL / uploaded project with explanation
    interview: 1.2,    // JobProof adaptive interview performance
    mission: 1.2,      // completed mission with reviewed evidence
    certificate: 0.6,  // learning evidence, never practical proof
    course: 0.6,
    portfolio: 1.0,
    document: 0.9,
    other: 0.7,
  };

  function itemStrength(e) {
    if (typeof e.strength === "number") return e.strength;
    return WEIGHTS[e.type] != null ? WEIGHTS[e.type] : 1;
  }

  /* Verify one skill from its evidence list. Returns
     { status, confidence (0-100), reason, limitations } — the
     reason always cites the evidence; never vibes. */

  function verify(skillName, items) {
    if (!items.length) {
      return {
        status: "INSUFFICIENT EVIDENCE",
        confidence: 0,
        reason: "No evidence has been submitted for this skill.",
        limitations: "A claim without evidence cannot be verified — it is not a judgment about your ability.",
      };
    }
    var score = 0;
    var kinds = {};
    items.forEach(function (e) { score += itemStrength(e); kinds[e.type] = true; });
    var hasPractical = kinds.github || kinds.project || kinds.mission;
    var hasValidation = kinds.interview;
    var hasLearning = kinds.certificate || kinds.course;

    var confidence = Math.min(96, Math.round(score * 22));

    if (hasPractical && (hasValidation || score >= 3.8)) {
      return {
        status: "VERIFIED",
        confidence: Math.min(96, confidence + 12),
        reason: describe(items) + " Together this demonstrates practical use" + (hasValidation ? " and you explained it under questioning." : "."),
        limitations: null,
      };
    }
    if (hasPractical || score >= 1.8) {
      return {
        status: "PARTIAL",
        confidence: confidence,
        reason: describe(items) + (hasLearning ? " A course or certificate shows learning, not practice." : " This shows real but limited practice."),
        limitations: hasValidation ? null : "No independent validation yet — an interview or deeper project would settle it.",
      };
    }
    if (hasLearning) {
      return {
        status: "PARTIAL",
        confidence: confidence,
        reason: describe(items) + " Coursework alone shows exposure, not applied ability.",
        limitations: "Needs practical evidence: a project, or code someone can inspect.",
      };
    }
    return {
      status: "NOT VERIFIED",
      confidence: confidence,
      reason: describe(items) + " This does not establish the claimed ability.",
      limitations: "The submitted material doesn't demonstrate this skill in use.",
    };
  }

  function describe(items) {
    var labels = { github: "a public repository", project: "a project", mission: "a completed mission",
      interview: "an interview", certificate: "a certificate", course: "a course", portfolio: "a portfolio", document: "a document", other: "submitted material" };
    var parts = [];
    var seen = {};
    items.forEach(function (e) {
      var l = labels[e.type] || "evidence";
      if (!seen[l]) { parts.push(l); seen[l] = true; }
    });
    return "Evidence on file: " + (parts.join(", ") || "none") + ".";
  }

  /* ---------- Core computation ---------- */

  /* Builds the skill ledger from four sources:
     1. Feature 1 analysis (what the target role requires, what the resume claims)
     2. Resume skill claims
     3. Manual skills the user added
     4. Evidence items (typed, dated, source-cited) */

  function computeAll(ctx) {
    var f2 = store.f2();
    var analysis = ctx.analysis || store.get().analysis;
    var roleReqLabels = [];
    var rolePrefLabels = [];

    if (analysis && analysis.match && analysis.match.evidence) {
      analysis.match.evidence.requirements.forEach(function (r) {
        if (r.extra) return;
        (r.tier === "preferred" ? rolePrefLabels : roleReqLabels).push(r.label);
      });
    }

    var claimed = [];
    if (ctx.resume && ctx.resume.structured) {
      (ctx.resume.structured.skills || []).forEach(function (s) { claimed.push(s.label || String(s)); });
    }

    // Union of all skills worth tracking, each labeled with where it came from.
    var names = [];
    function addName(n, source) {
      if (!n) return;
      var key = U.norm(n);
      var hit = names.find(function (x) { return x.key === key; });
      if (hit) { hit.sources.push(source); }
      else names.push({ key: key, name: n, sources: [source] });
    }
    roleReqLabels.forEach(function (n) { addName(n, "job"); });
    rolePrefLabels.forEach(function (n) { addName(n, "job-pref"); });
    claimed.forEach(function (n) { addName(n, "resume"); });
    (f2.skills || []).forEach(function (s) { addName(s.name, "manual"); });
    (f2.evidence || []).forEach(function (e) { if (e.skill) addName(e.skill, "evidence"); });

    // Recompute each skill row from current evidence (idempotent).
    var skills = names.map(function (n) {
      var items = (f2.evidence || []).filter(function (e) {
        return e.skill && U.norm(e.skill) === n.key;
      });
      var v = verify(n.name, items);
      var manual = (f2.skills || []).find(function (s) { return U.norm(s.name) === n.key; });
      return {
        id: manual ? manual.id : store.uid("skill"),
        name: n.name,
        key: n.key,
        claimed: n.sources.indexOf("resume") !== -1 || n.sources.indexOf("manual") !== -1,
        required: n.sources.indexOf("job") !== -1,
        preferred: n.sources.indexOf("job-pref") !== -1 && n.sources.indexOf("job") === -1,
        status: v.status,
        confidence: v.confidence,
        reason: v.reason,
        limitations: v.limitations,
        forRole: n.sources.indexOf("job") !== -1,
        evidenceCount: items.length,
      };
    });

    // Persist skill rows (new ones only get appended; existing rows are updated).
    var prev = {};
    (f2.skills || []).forEach(function (s) { prev[s.key || U.norm(s.name)] = s; });
    f2.skills = skills.map(function (s) {
      var old = prev[s.key];
      if (old && old.status !== s.status) {
        f2.history.unshift({
          id: store.uid("hist"), skill: s.name,
          oldStatus: old.status, newStatus: s.status,
          reason: s.reason, at: new Date().toISOString(),
        });
        if (f2.history.length > 100) f2.history.length = 100;
      }
      return s;
    });

    // Gaps: role-relevant skills that are NOT verified. Distinguish
    // "no evidence" from "can't do" — the wording rules require it.
    var gaps = [];
    skills.forEach(function (s) {
      if (s.required && (s.status === "NOT VERIFIED" || s.status === "INSUFFICIENT EVIDENCE")) {
        gaps.push({
          id: s.id,
          title: s.name,
          severity: "high",
          claim: s.claimed ? "Listed on your resume" : "Required by the role",
          status: s.status,
          why: "This skill is required by the target role and your evidence doesn't demonstrate it yet.",
          currentEvidence: s.evidenceCount ? "Some material on file, but it doesn't establish the skill." : "No evidence on file.",
          requiredEvidence: "A practical demonstration: project, public code, or a reviewed mission.",
        });
      } else if (s.required && s.status === "PARTIAL") {
        gaps.push({
          id: s.id,
          title: s.name,
          severity: "medium",
          claim: s.claimed ? "Listed on your resume" : "Required by the role",
          status: s.status,
          why: "Some evidence exists, but it doesn't yet establish the depth the role expects.",
          currentEvidence: s.reason,
          requiredEvidence: "Deeper or independently reviewed evidence (mission, interview, larger project).",
        });
      }
    });
    // Gaps from Feature 1's honest priorities that map to evidence issues
    if (analysis && analysis.match) {
      var evidCat = analysis.match.categories.filter(function (c) { return c.key === "evidence"; })[0];
      if (evidCat && evidCat.score < 60) {
        gaps.push({
          id: store.uid("gap"),
          title: "Measurable outcomes in resume bullets",
          severity: evidCat.score < 40 ? "high" : "medium",
          claim: "Resume claims experience",
          status: "PARTIAL",
          why: evidCat.detail || "Bullets describe activity, not results.",
          currentEvidence: "Existing bullets on file.",
          requiredEvidence: "Rewritten bullets with truthful outcomes (Feature 1 rewrites).",
          resumeFix: true, // fixable inside Feature 1, no new skill needed
        });
      }
    }

    store.save();
    return { skills: skills, gaps: gaps };
  }

  /* ---------- Evidence CRUD ---------- */

  function addEvidence(ev) {
    var f2 = store.f2();
    var item = {
      id: store.uid("ev"),
      skill: ev.skill || "",
      type: ev.type || "other",
      source: ev.source || "",
      url: ev.url || "",
      description: ev.description || "",
      missionId: ev.missionId || null,
      strength: typeof ev.strength === "number" ? ev.strength : undefined,
      assessment: ev.assessment || null,
      submittedAt: new Date().toISOString(),
    };
    f2.evidence.unshift(item);
    store.save();
    JP.agents.log("Evidence Engine", JP.agents.S.COMPLETED,
      "Evidence added" + (item.skill ? " for \u201C" + item.skill + "\u201D" : "") + " (" + item.type + ").");
    return item;
  }

  function deleteEvidence(id) {
    var f2 = store.f2();
    f2.evidence = f2.evidence.filter(function (e) { return e.id !== id; });
    store.save();
  }

  JP.verifier = {
    STATUSES: STATUSES,
    WEIGHTS: WEIGHTS,
    verify: verify,
    computeAll: computeAll,
    addEvidence: addEvidence,
    deleteEvidence: deleteEvidence,
    itemStrength: itemStrength,
  };
})();
