/* ============================================================
   JobProof AI — js/insights.js
   Analysis engine, part B.
   - Hiring Manager View (first impression / attention / skim /
     concern / fix first — all grounded in parsed resume data)
   - Role Requirement Benchmark ("You vs expected evidence")
   - Brutally Honest Mode (direct, no insults, always actionable)
   - Fix-First Priorities (max 3, why + what to change)
   Every claim carries a classification: DIRECT EVIDENCE /
   INFERRED / MISSING / JOB-REQUIRED. If we can't judge it,
   we say so.
   ============================================================ */

(function () {
  "use strict";

  var JP = window.JP;
  var U = JP.util;
  var TAX = JP.TAX;

  function norm(s) { return U.norm(s); }

  /* ================= Hiring Manager View ================= */

  var GENERIC_PHRASES = [
    { re: /\b(hardworking|hard.working)\b/i, msg: "self-description (\u201Chardworking\u201D) instead of evidence" },
    { re: /\b(passionate about (technology|learning|innovation))\b/i, msg: "\u201Cpassionate about\u2026\u201D — every resume says this" },
    { re: /\b(team player)\b/i, msg: "\u201Cteam player\u201D — show collaboration through an outcome instead" },
    { re: /\b(good communicator|excellent communication skills)\b/i, msg: "claims of communication skill without an example" },
    { re: /\b(dynamic|results.driven|self.motivated|go.?getter)\b/i, msg: "buzzword self-description (\u201Cresults-driven\u201D type)" },
    { re: /\b(responsible for)\b/i, msg: "\u201Cresponsible for\u201D — describes a duty, not an outcome" },
    { re: /\b(worked on (various|multiple|several))\b/i, msg: "\u201Cworked on various\u2026\u201D — vague, unverifiable" },
    { re: /\b(utiliz(e|ed|ing))\b/i, msg: "\u201Cutilized\u201D — usually means \u201Cused\u201D" },
    { re: /\b(synerg(y|ies|istic))\b/i, msg: "corporate filler (\u201Csynergy\u201D)" },
    { re: /\b(thought leadership|best practices)\b/i, msg: "corporate filler phrases" },
  ];

  JP.computeInsights = function (resume, jd, match) {
    var role = match.role && match.role.key ? JP.ROLE_HINTS.detect(match.role.label) : null;
    var skills = match.evidence.resumeSkills || [];
    var topSkills = skills.slice(0, 6).map(function (s) { return s.label; });
    var weakBullets = resume.bullets.filter(function (b) { return b.weakStart; });
    var noMetricBullets = resume.bullets.filter(function (b) { return !b.hasMetric; });
    var metricBullets = resume.bullets.filter(function (b) { return b.hasMetric; });
    var reqReqs = match.evidence.requirements.filter(function (r) { return r.tier === "required" && r.resumeCount === 0 && !r.extra; });
    var expCat = match.categories.filter(function (c) { return c.key === "experience"; })[0];
    var projCat = match.categories.filter(function (c) { return c.key === "projects"; })[0];
    var kwCat = match.categories.filter(function (c) { return c.key === "keywords"; })[0];

    var view = {
      firstImpression: null,
      attention: [],
      skim: [],
      concern: [],
      fixFirst: [],
    };

    /* ---- First impression (what stands out in 10 seconds) ---- */
    var fi = [];
    if (topSkills.length) {
      fi.push("The skill story is clear: " + topSkills.slice(0, 4).join(", ") + ".");
    }
    if (metricBullets.length) {
      fi.push(metricBullets.length + " bullet" + (metricBullets.length === 1 ? "" : "s") + " carry numbers — those are what a reviewer actually reads.");
    } else if (resume.bullets.length) {
      fi.push("No bullet points carry measurable results, so nothing numerically stands out in a first pass.");
    }
    if (resume.projects.length && !resume.experience.length) {
      fi.push("Projects lead this resume — expected for a student/fresher profile, and fine.");
    }
    var titleLine = jd.title ? "\u201C" + jd.title + "\u201D" : "this role";
    fi.push("Set against " + titleLine + ", the overall shape reads " + (match.overall >= 70 ? "credible" : match.overall >= 50 ? "promising but thin" : "off-target") + ".");
    view.firstImpression = fi.join(" ");

    /* ---- Attention (what deserves the reviewer's focus) ---- */
    var strongest = resume.bullets.filter(function (b) { return b.hasMetric && b.strongStart; })
      .sort(function (a, b) { return (b.metric || "").length - (a.metric || "").length; })[0];
    if (strongest) {
      view.attention.push({ text: "Strongest line: \u201C" + clip(strongest.text, 120) + "\u201D", classification: "DIRECT EVIDENCE" });
    }
    if (resume.projects.length) {
      var p = resume.projects[0];
      view.attention.push({ text: "Project: " + clip(p.name || "Untitled project", 70) + (p.bullets.length ? " — " + p.bullets.length + " bullet(s) of evidence." : "."), classification: "DIRECT EVIDENCE" });
    }
    if (expCat && expCat.years != null) {
      view.attention.push({ text: "About " + expCat.years + " years of dated experience.", classification: "DIRECT EVIDENCE" });
    }
    if (certifs(resume).length) {
      view.attention.push({ text: "Certifications listed: " + certifs(resume).slice(0, 2).join("; ") + ".", classification: "USER-PROVIDED" });
    }
    if (!view.attention.length) {
      view.attention.push({ text: "Nothing jumps out yet — the resume states roles but shows few concrete artifacts.", classification: "INFERRED" });
    }

    /* ---- Skim (what a reviewer will skip) ---- */
    if (weakBullets.length) {
      view.skim.push({
        text: weakBullets.length + " bullet" + (weakBullets.length === 1 ? "" : "s") + " start passively (\u201Cworked on\u201D, \u201Cresponsible for\u201D\u2026). Reviewers skim past these.",
        bullets: weakBullets.slice(0, 3).map(function (b) { return clip(b.text, 90); }),
        classification: "DIRECT EVIDENCE",
      });
    }
    if (noMetricBullets.length > resume.bullets.length / 2 && resume.bullets.length >= 4) {
      view.skim.push({
        text: "Most bullets describe activity, not results — they read as a task list and get skimmed.",
        classification: "INFERRED",
      });
    }
    (resume.sectionMap.summary || []).forEach(function (l) {
      var hits = GENERIC_PHRASES.filter(function (g) { return g.re.test(l); });
      if (hits.length && l.length > 60) {
        view.skim.push({ text: "The summary leans generic: " + hits[0].msg + ".", classification: "DIRECT EVIDENCE" });
      }
    });
    if (resume.meta.wordCount > 950) {
      view.skim.push({ text: "At " + resume.meta.wordCount + " words, later sections won't be read closely.", classification: "INFERRED" });
    }

    /* ---- Concern (what weakens the application) ---- */
    if (reqReqs.length) {
      var names = reqReqs.slice(0, 4).map(function (r) { return r.label; }).join(", ");
      view.concern.push({
        text: "The posting asks for " + names + (reqReqs.length > 4 ? "…" : "") + " — none appear anywhere in your resume.",
        classification: "MISSING",
      });
    }
    if (expCat && typeof expCat.score === "number" && expCat.score < 55) {
      view.concern.push({ text: expCat.detail, classification: expCat.years != null ? "INFERRED" : "MISSING" });
    }
    if (kwCat && typeof kwCat.score === "number" && kwCat.score < 40) {
      view.concern.push({ text: "Only ~" + kwCat.score + "% of the posting's recurring keywords appear in your resume — automated screens may rank this low.", classification: "INFERRED" });
    }
    if (resume.contact && !resume.contact.hasEmail) {
      view.concern.push({ text: "No email address was detected — a real screen-out risk.", classification: "DIRECT EVIDENCE" });
    }
    if (!view.concern.length) {
      view.concern.push({ text: "No structural concerns. The remaining risk is normal competition — other candidates will also match these requirements.", classification: "INFERRED" });
    }

    /* ---- Fix first (manager's ordering) ---- */
    var fixes = [];
    if (weakBullets.length >= 2) fixes.push("Rewrite passive bullets into action + result.");
    if (metricBullets.length === 0 && resume.bullets.length >= 3) fixes.push("Add real, truthful numbers to at least your top bullets.");
    if (reqReqs.length) fixes.push("Close the biggest requirement gaps you can honestly close (" + reqReqs.slice(0, 2).map(function (r) { return r.label; }).join(", ") + ").");
    if (projCat && projCat.score < 50) fixes.push("Give projects real scope and outcomes.");
    view.fixFirst = fixes.slice(0, 3);

    return view;
  };

  function clip(s, n) {
    s = String(s || "").trim();
    return s.length > n ? s.slice(0, n - 1).replace(/[\s,;:.-]+$/, "") + "…" : s;
  }

  function certifs(resume) {
    var lines = resume.sectionMap.certifications || [];
    return lines.map(function (l) { return clip(l.replace(/^[-•*\u2022]\s*/, ""), 60); }).filter(Boolean).slice(0, 3);
  }

  /* ================= Benchmark: You vs role expectation ================= */

  JP.computeBenchmark = function (resume, jd, match) {
    var role = match.role && match.role.key ? JP.ROLE_HINTS.detect(match.role.label) : null;
    var rows = [];

    match.evidence.requirements.forEach(function (r) {
      if (r.extra) return; // raw JD keywords only appear in the keyword section
      var expectation;
      if (r.tier === "required") expectation = "Required by this job";
      else expectation = "Preferred by this job";

      var you;
      if (r.resumeCount === 0) {
        you = { level: "No evidence", pct: 0, classification: "MISSING" };
      } else if (r.inBullets) {
        you = { level: r.resumeCount >= 3 ? "Strong" : "Present", pct: r.resumeCount >= 3 ? 85 : 65, classification: "DIRECT EVIDENCE" };
      } else {
        you = { level: "Listed only", pct: 40, classification: "DIRECT EVIDENCE" };
      }

      // "Core to this role family" is role knowledge — always labelled.
      var coreNote = null;
      if (role && JP.ROLE_HINTS.isCore(role, r.key, r.label)) {
        coreNote = "Core skill for " + role.label + " roles (role knowledge, not from this posting).";
      }

      rows.push({
        term: r.label,
        expectation: expectation,
        coreNote: coreNote,
        you: you.level,
        pct: you.pct,
        classification: you.classification,
        jdContext: r.jdContext,
        resumeContext: r.resumeContext,
      });
    });

    rows.sort(function (a, b) {
      var rank = function (x) { return x.pct; };
      return rank(a) - rank(b);
    });

    return {
      rows: rows,
      note: "\u201CRole expectation\u201D comes from the job description itself; \u201CYou\u201D comes only from your resume text. Where a row reflects general role knowledge rather than this posting, it says so.",
    };
  };

  /* ================= Brutally Honest mode ================= */

  JP.computeHonest = function (resume, jd, match, keywords) {
    var parts = [];
    var honest = { headline: "", body: [], fix: [] };

    var reqReqs = match.evidence.requirements.filter(function (r) { return r.tier === "required" && r.resumeCount === 0 && !r.extra; });
    var expCat = match.categories.filter(function (c) { return c.key === "experience"; })[0];
    var evidCat = match.categories.filter(function (c) { return c.key === "evidence"; })[0];
    var projCat = match.categories.filter(function (c) { return c.key === "projects"; })[0];
    var kwCat = match.categories.filter(function (c) { return c.key === "keywords"; })[0];

    if (match.overall >= 80) {
      honest.headline = "You're ready to submit this.";
      honest.body.push("The match is strong and the remaining gaps are minor. Submit, and focus your energy on interview prep rather than more editing.");
    } else if (match.overall >= 65) {
      honest.headline = "Close, but not clean yet.";
      honest.body.push("You have a real foundation for this role. What's holding the application back is precision, not substance: the posting asks for specific things your resume doesn't currently name.");
    } else if (match.overall >= 45) {
      honest.headline = "You're not ready to submit this version yet.";
      honest.body.push("Your biggest problem isn't formatting — it's evidence. The posting names specific requirements your resume doesn't currently demonstrate.");
      if (reqReqs.length) {
        honest.body.push("Missing from your resume: " + reqReqs.slice(0, 5).map(function (r) { return r.label; }).join(", ") + ".");
      }
    } else {
      honest.headline = "This application, as it stands, won't get considered.";
      honest.body.push("The gap between this job's requirements and your resume is too wide for edits to fix. Either target a closer role, or build the missing experience and re-run this analysis.");
      if (reqReqs.length) {
        honest.body.push("The core gaps: " + reqReqs.slice(0, 5).map(function (r) { return r.label; }).join(", ") + ".");
      }
    }

    // Fix list mirrors the priority engine, capped at 3.
    var priorities = JP.computePriorities(resume, jd, match, keywords);
    honest.fix = priorities.items.map(function (p) { return p.title; }).slice(0, 3);

    honest.note = "Direct by design — no flattery, no exaggeration. Every point above is checkable against your resume and the posting.";
    return honest;
  };

  /* ================= Fix-first priorities ================= */

  JP.computePriorities = function (resume, jd, match, keywords) {
    var items = [];
    var reqReqs = match.evidence.requirements.filter(function (r) { return r.tier === "required" && r.resumeCount === 0 && !r.extra; });
    var weakBullets = resume.bullets.filter(function (b) { return b.weakStart; });
    var metricBullets = resume.bullets.filter(function (b) { return b.hasMetric; });
    var cat = function (k) { return match.categories.filter(function (c) { return c.key === k; })[0]; };
    var projCat = cat("projects");
    var expCat = cat("experience");
    var evidCat = cat("evidence");
    var kwCat = cat("keywords");

    // 1) Evidence quality — always the first lever when weak.
    if (evidCat && evidCat.score < 60 && resume.bullets.length) {
      items.push({
        section: "Experience & Projects",
        title: "Rewrite bullets into evidence",
        why: evidCat.detail,
        what: "Lead with the action, name the technology, and state the truthful outcome. " + (metricBullets.length ? "Add numbers to the bullets that currently lack them." : "Right now no bullet carries a measurable result."),
        weight: 90 + evidCat.score,
      });
    }

    // 2) Missing required skills that the user can plausibly evidence.
    if (reqReqs.length) {
      items.push({
        section: "Skills / Keyword coverage",
        title: "Surface what you already have",
        why: "The posting requires " + reqReqs.slice(0, 4).map(function (r) { return r.label; }).join(", ") + " and your resume doesn't mention " + (reqReqs.length > 1 ? "them" : "it") + ".",
        what: "If you have used any of these — in a project, coursework, or internship — name them explicitly in context. If you haven't, don't add them; the honest gap belongs in a cover letter instead.",
        weight: 85 + Math.min(15, reqReqs.length * 3),
      });
    }

    // 3) Projects thin.
    if (projCat && projCat.score < 55) {
      items.push({
        section: "Projects",
        title: "Make one project prove depth",
        why: projCat.detail,
        what: "Pick your most relevant project. State the problem, the stack, and the outcome in 2–3 bullets. Depth on one real project beats three shallow ones.",
        weight: 75 + projCat.score,
      });
    }

    // 4) Experience/dates problems.
    if (expCat && typeof expCat.score === "number" && expCat.score < 60) {
      items.push({
        section: "Experience",
        title: expCat.years != null ? "Close the experience gap or reframe it" : "Add structure to your experience",
        why: expCat.detail,
        what: expCat.years != null
          ? "You can't manufacture years. Make the experience you do have unambiguous: scope, ownership, tools, outcomes."
          : "Add clear dates, role titles, and 2–3 outcome bullets to each experience entry.",
        weight: 70 + expCat.score,
      });
    }

    // 5) Keyword coverage.
    if (kwCat && typeof kwCat.score === "number" && kwCat.score < 45) {
      items.push({
        section: "Keywords",
        title: "Cover the recurring terms honestly",
        why: "About " + kwCat.score + "% of the posting's recurring keywords appear in your resume.",
        what: "For each missing term you genuinely know, work it into a bullet with context. Skip the ones you can't back up — padding is detectable in interviews.",
        weight: 60 + kwCat.score,
      });
    }

    items.sort(function (a, b) { return b.weight - a.weight; });
    items.forEach(function (it, i) { it.rank = i + 1; });
    return { items: items.slice(0, 3) };
  };

  /* ================= Final analysis (the one screen that matters) ================= */

  JP.computeFinal = function (match, priorities) {
    var top = priorities.items.map(function (p) { return p.title; });
    var verdicts = [
      { min: 80, label: "Strong foundation. Application-ready." },
      { min: 65, label: "Solid foundation. Not application-ready yet." },
      { min: 45, label: "Real gaps. Fix before you apply." },
      { min: 0, label: "Off-target for this role right now." },
    ];
    var label = "Off-target for this role right now.";
    for (var i = 0; i < verdicts.length; i++) {
      if (match.overall >= verdicts[i].min) { label = verdicts[i].label; break; }
    }
    return {
      match: match.overall,
      verdict: label,
      fixThree: top,
      disclaimer: "An estimate based on this posting and your resume — not a prediction of hiring outcomes.",
    };
  };
})();
