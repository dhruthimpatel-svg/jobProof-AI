/* ============================================================
   JobProof AI — js/analysis.js
   Analysis engine, part A.
   - Evidence map: resume skills vs. job requirements
   - Role Match Score: transparent weighted breakdown
   - ATS screening analysis
   - Keyword analysis (required / preferred, found / missing)
   Claims are classified DIRECT EVIDENCE / INFERRED / MISSING /
   USER-PROVIDED / JOB-REQUIRED. Nothing is fabricated.
   ============================================================ */

(function () {
  "use strict";

  var JP = window.JP;
  var U = JP.util;
  var TAX = JP.TAX;
  var INTERN = JP._parseInternals;

  /* ================= Evidence map ================= */

  function buildEvidenceMap(resume, jd) {
    var resumeSkills = TAX.matchAll(resume.text);
    var byKey = {};
    resumeSkills.forEach(function (s) { byKey[s.key] = s; });

    // Where does each skill appear? bullets (stronger) vs skills list (weaker).
    var bulletText = "";
    (resume.sectionMap.experience || []).forEach(function (l) { bulletText += l + "\n"; });
    (resume.sectionMap.projects || []).forEach(function (l) { bulletText += l + "\n"; });
    var bulletKeys = {};
    TAX.matchAll(bulletText).forEach(function (s) { bulletKeys[s.key] = true; });

    // JD requirement set from parsed skill mentions.
    var reqKeys = {}; // key -> {tier, jdContext}
    function addReq(key, label, tier, ctx) {
      if (!reqKeys[key]) reqKeys[key] = { key: key, label: label, tier: tier, jdContext: ctx || null, jdCount: 0 };
      if (tier === "required") reqKeys[key].tier = "required"; // required wins
      reqKeys[key].jdCount++;
    }

    function ingest(mentions, tierFor) {
      mentions.forEach(function (m) {
        var tier = tierFor(m);
        var ctx = m.ctx || null;
        if (byKey[m.key]) addReq(m.key, byKey[m.key].label, tier, ctx);
        else addReq(m.key, m.label, tier, ctx);
      });
    }

    var hasReqSection = jd.requirementLines && jd.requirementLines.length > 0;
    var hasPrefSection = jd.preferredLines && jd.preferredLines.length > 0;

    ["langs", "frameworks", "tools", "ml", "domain"].forEach(function (group) {
      var list = jd.skillMentions[group] || [];
      ingest(list, function (m) {
        if (hasPrefSection && !hasReqSection) return "preferred";
        // If the mention context sits in the preferred section text, mark preferred.
        if (hasPrefSection) {
          var prefText = U.norm(jd.preferredLines.join("\n"));
          if (ctxIn(prefText, m)) return "preferred";
        }
        return "required";
      });
    });

    function ctxIn(prefText, m) {
      if (!m.ctx) return false;
      return prefText.indexOf(U.norm(m.ctx).slice(0, 40)) !== -1;
    }

    // Extra explicit JD keywords not covered by taxonomy skills.
    var coveredLabels = {};
    Object.keys(reqKeys).forEach(function (k) {
      var label = U.norm(reqKeys[k].label);
      coveredLabels[label] = true;
    });
    var extra = [];
    jd.keywords.forEach(function (kw) {
      var w = kw.word;
      if (coveredLabels[w]) return;
      if (w.length < 4) return;
      // Skip words already inside a known skill label.
      var inside = Object.keys(coveredLabels).some(function (l) { return l.indexOf(w) !== -1; });
      if (inside) return;
      if (TAX.matchKeyword(resume.text, w) > 0) return; // present in resume; not a gap
      var ctx = TAX.evidenceAround(jd.text, w);
      extra.push({ key: "kw_" + w, label: w, tier: hasPrefSection && ctx && isPrefContext(jd, ctx) ? "preferred" : "required", jdContext: ctx, jdCount: kw.count, extra: true });
    });
    extra.sort(function (a, b) { return b.jdCount - a.jdCount; });
    extra.slice(0, 8).forEach(function (e) {
      if (!reqKeys[e.key]) reqKeys[e.key] = e;
    });

    var requirements = Object.keys(reqKeys).map(function (k) {
      var r = reqKeys[k];
      var hit = byKey[r.key];
      var inBullets = !!bulletKeys[r.key];
      var count = hit ? hit.count : 0;
      var resumeCtx = hit ? hit.ctx : null;
      var strength = count === 0 ? 0 : inBullets ? 0.92 : 0.55;
      if (count >= 3 && inBullets) strength = 1;
      var cls = count === 0 ? "MISSING" : "DIRECT EVIDENCE";
      return Object.assign({}, r, {
        resumeCount: count,
        resumeContext: resumeCtx,
        inBullets: inBullets,
        strength: strength,
        classification: cls,
      });
    });

    return { requirements: requirements, resumeSkills: resumeSkills, bulletKeys: bulletKeys };
  }

  function isPrefContext(jd, ctx) {
    var pref = U.norm(jd.preferredLines.join("\n"));
    return ctx && pref.indexOf(U.norm(ctx).slice(0, 30)) !== -1;
  }

  /* ================= Scoring helpers ================= */

  function scoreRequiredSkills(evidence) {
    var reqs = evidence.requirements.filter(function (r) { return r.tier === "required" && !r.extra; });
    if (!reqs.length) return { score: null, detail: "No distinct required skills were detected in this job description.", items: [] };
    var items = reqs.map(function (r) {
      return { label: r.label, pct: Math.round(r.strength * 100), classification: r.classification };
    });
    var avg = reqs.reduce(function (a, r) { return a + r.strength; }, 0) / reqs.length;
    return { score: Math.round(avg * 100), detail: null, items: items };
  }

  function scorePreferredSkills(evidence) {
    var prefs = evidence.requirements.filter(function (r) { return r.tier === "preferred" && !r.extra; });
    if (!prefs.length) return { score: null, detail: "No preferred skills were separately listed.", items: [] };
    var avg = prefs.reduce(function (a, r) { return a + Math.max(r.strength, 0.25); }, 0) / prefs.length;
    return { score: Math.round(avg * 100), detail: null, items: prefs.map(function (r) { return { label: r.label, pct: Math.round(r.strength * 100) }; }) };
  }

  function estimateResumeYears(resume) {
    var total = 0;
    var now = new Date();
    var anyDated = false;
    (resume.experience || []).forEach(function (e) {
      var d = e.dates || "";
      var m = d.match(/([a-z]{3,9})\.?\s*'?(\d{2,4})\s*(?:–|—|-|to)\s*([a-z]{3,9})\.?\s*'?(\d{2,4}|present|current|now)/i);
      if (m) {
        anyDated = true;
        var startY = parseYear(m[2]);
        var endY = /present|current|now/i.test(m[4]) ? now.getFullYear() : parseYear(m[4]);
        var endM = /present|current|now/i.test(m[4]) ? now.getMonth() + 1 : monthNum(m[3]);
        var startM = monthNum(m[1]);
        var months = (endY - startY) * 12 + (endM - startM);
        if (months > 0 && months < 12 * 45) total += months;
      } else {
        var m2 = d.match(/(\d{4})\s*(?:–|—|-|to)\s*(\d{4}|present|current)/i);
        if (m2) {
          anyDated = true;
          var y1 = parseInt(m2[1], 10);
          var y2 = /present|current/i.test(m2[2]) ? now.getFullYear() : parseInt(m2[2], 10);
          var yrs = y2 - y1;
          if (yrs > 0 && yrs < 45) total += yrs * 12;
        }
      }
    });
    return { months: total, years: total / 12, anyDated: anyDated };
  }

  function parseYear(y) {
    var n = parseInt(y, 10);
    if (isNaN(n)) return 0;
    if (n < 100) return n + (n > 60 ? 1900 : 2000);
    return n;
  }

  function monthNum(name) {
    var idx = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
      .indexOf(String(name).toLowerCase().slice(0, 3));
    return idx === -1 ? 6 : idx + 1;
  }

  function scoreExperience(resume, jd, evidence) {
    var est = estimateResumeYears(resume);
    var req = jd.requirements.years;
    var detail, classification;

    if (req && req.min > 0) {
      classification = "JOB-REQUIRED";
      if (!est.anyDated) {
        return { score: 50, detail: "The role asks for " + req.min + "+ years of experience, but your resume has no parseable employment dates. Not enough evidence to determine this.", classification: "INFERRED", years: null, reqYears: req.min };
      }
      var yrs = est.years;
      var ratio = yrs / req.min;
      var score;
      if (ratio >= 1) score = 92;
      else if (ratio >= 0.75) score = 76;
      else if (ratio >= 0.5) score = 56;
      else if (yrs > 0.5) score = 34;
      else score = 20;
      detail = "Role asks for " + req.min + "+ years; your resume shows about " + (Math.round(yrs * 10) / 10) + " years of dated employment." + (score < 76 ? " Adjacent experience (internships, freelance, projects) may not be counted here." : "");
      return { score: score, detail: detail, classification: classification, years: Math.round(yrs * 10) / 10, reqYears: req.min };
    }

    // No explicit requirement — judge evidence completeness instead.
    var n = (resume.experience || []).length;
    if (n === 0) {
      return { score: 40, detail: "No experience section was detected. If you have internships, freelance or volunteer work, it should be here.", classification: "MISSING", years: null, reqYears: null };
    }
    classification = "DIRECT EVIDENCE";
    var score2 = est.anyDated ? 74 : 58;
    if (n >= 2 && est.anyDated) score2 = 82;
    return { score: score2, detail: "No specific year requirement was stated. Your resume lists " + n + " experience entr" + (n === 1 ? "y" : "ies") + (est.anyDated ? " with dates." : ", but most entries lack clear dates."), classification: classification, years: est.anyDated ? Math.round(est.years * 10) / 10 : null, reqYears: null };
  }

  function scoreProjects(resume, jd, role) {
    var projects = resume.projects || [];
    var b = resume.bullets.filter(function (x) { return x.hasMetric; }).length;
    var strong = resume.bullets.filter(function (x) { return x.strongStart; }).length;
    var base = projects.length === 0 ? 28 : 40 + Math.min(30, projects.length * 12);
    var bonus = Math.min(20, strong * 3 + b * 4);
    var score = U.clamp(Math.round(base + bonus), 10, 96);
    var detail;
    if (projects.length === 0) {
      detail = "No Projects section was found. For hands-on roles, personal and academic projects are often the clearest proof of skill.";
    } else {
      detail = projects.length + " project" + (projects.length === 1 ? "" : "s") + " found" + (b ? ", " + b + " bullet(s) with measurable results." : ", but few bullets include measurable results.");
    }
    return { score: score, detail: detail, classification: projects.length ? "DIRECT EVIDENCE" : "MISSING", count: projects.length };
  }

  var EDU_LEVELS = { "phd": 4, "master's": 3, "bachelor's": 2, "degree (field unspecified)": 2, "diploma": 1, "high school": 1 };

  function resumeEduLevel(resume) {
    var best = 0, bestLabel = null;
    (resume.education || []).forEach(function (e) {
      var t = U.norm(e.text);
      var m = t.match(/\b(ph\.?d|doctorate|master'?s|m\.?sc|m\.?tech|mba|bachelor'?s|b\.?tech|b\.?e\b|b\.?sc|b\.?a\b|diploma|high school|secondary school)\b/);
      if (!m) return;
      var lvl = U.norm(m[0]).indexOf("ph") === 0 || /doctorate/.test(m[0]) ? 4
        : /master|m\.?sc|m\.?tech|mba/.test(m[0]) ? 3
        : /bachelor|b\.?tech|b\.?e\b|b\.?sc|b\.?a\b/.test(m[0]) ? 2
        : /diploma/.test(m[0]) ? 1 : 1;
      if (lvl > best) { best = lvl; bestLabel = e.degree; }
    });
    return { level: best, label: bestLabel };
  }

  function scoreEducation(resume, jd) {
    var req = jd.requirements.education;
    var mine = resumeEduLevel(resume);
    var reqLevel = req && req.level ? (EDU_LEVELS[U.norm(req.level)] || 2) : null;

    if (!reqLevel) {
      return {
        score: mine.level ? 78 : 45,
        detail: mine.level
          ? "No specific degree requirement was found in the posting" + (mine.label ? "; your resume lists " + mine.label + "." : ".")
          : "No specific degree requirement was found, and your resume has no clear education section.",
        classification: mine.level ? "DIRECT EVIDENCE" : "MISSING",
      };
    }
    if (!mine.level) {
      return { score: 42, detail: "The role asks for a " + req.level + " degree (or equivalent), but your resume has no parseable education section. Not enough evidence to determine this.", classification: "INFERRED" };
    }
    if (mine.level >= reqLevel) {
      return { score: 90, detail: "Your education (" + (mine.label || "degree listed") + ") meets the " + req.level + " requirement.", classification: "DIRECT EVIDENCE" };
    }
    if (reqLevel - mine.level === 1) {
      return { score: 55, detail: "The posting asks for " + req.level + "-level education; your resume shows a lower degree. Equivalent practical experience is often accepted, but it may be screened.", classification: "INFERRED" };
    }
    return { score: 30, detail: "The posting asks for " + req.level + "-level education, which your resume doesn't show.", classification: "MISSING" };
  }

  function scoreKeywords(jd, resume, evidence) {
    var kws = jd.keywords || [];
    if (!kws.length) return { score: null, detail: null, found: [], missing: [] };
    var found = [], missing = [];
    kws.forEach(function (k) {
      var c = TAX.matchKeyword(resume.text, k.word);
      if (c > 0) found.push({ word: k.word, count: c });
      else missing.push({ word: k.word, count: k.count, ctx: TAX.evidenceAround(jd.text, k.word) });
    });
    var ratio = kws.length ? found.length / kws.length : 0;
    return { score: Math.round(ratio * 100), detail: null, found: found, missing: missing };
  }

  function scoreResponsibilities(jd, resume) {
    var lines = (jd.responsibilities || []).slice(0, 8);
    if (!lines.length) return { score: null, detail: "No distinct responsibilities section was found in the posting.", addressed: [], weak: [] };
    var addressed = [], weak = [];
    lines.forEach(function (line) {
      var words = U.norm(line).match(/[a-z][a-z0-9+#.\-]{3,}/g) || [];
      var sig = words.filter(function (w) { return !/^(the|and|for|with|that|this|from|will|your|our|you|are|have|using|across|into|their|them|other|about|more|than|when|what|work|role|team|help|also|well|new|who|all|any|per|via|via)$/.test(w); });
      if (sig.length < 2) return;
      var hits = sig.filter(function (w) { return TAX.matchKeyword(resume.text, w) > 0; }).length;
      var ratio = hits / sig.length;
      var item = { text: line.slice(0, 130), pct: Math.round(ratio * 100) };
      if (ratio >= 0.4) addressed.push(item);
      else weak.push(item);
    });
    var total = addressed.length + weak.length;
    var score = total ? Math.round((addressed.length / total) * 100) : null;
    return { score: score, detail: null, addressed: addressed, weak: weak };
  }

  function scoreEvidence(resume) {
    var bullets = resume.bullets || [];
    if (!bullets.length) {
      return { score: 35, detail: "No achievement bullets were detected. Roles are usually screened on evidence, not task lists.", classification: "MISSING" };
    }
    var n = bullets.length;
    var metricR = bullets.filter(function (x) { return x.hasMetric; }).length / n;
    var strongR = bullets.filter(function (x) { return x.strongStart; }).length / n;
    var weakR = bullets.filter(function (x) { return x.weakStart; }).length / n;
    var score = U.clamp(Math.round(30 + 50 * metricR + 30 * strongR - 22 * weakR), 8, 97);
    var parts = [];
    parts.push(Math.round(metricR * 100) + "% of your bullets contain measurable results");
    parts.push(Math.round(strongR * 100) + "% start with a strong action verb");
    if (weakR > 0.15) parts.push(Math.round(weakR * 100) + "% start with weak phrasing like \u201Cworked on\u201D or \u201Cresponsible for\u201D");
    return { score: score, detail: parts.join("; ") + ".", classification: "DIRECT EVIDENCE" };
  }

  /* ================= Role Match Score ================= */

  JP.computeMatch = function (resume, jd) {
    var evidence = buildEvidenceMap(resume, jd);
    var role = JP.ROLE_HINTS.detect(jd.title || jd.text || "");

    var reqSk = scoreRequiredSkills(evidence);
    var prefSk = scorePreferredSkills(evidence);
    var exp = scoreExperience(resume, jd, evidence);
    var proj = scoreProjects(resume, jd, role);
    var edu = scoreEducation(resume, jd);
    var kws = scoreKeywords(jd, resume, evidence);
    var resp = scoreResponsibilities(jd, resume);
    var evid = scoreEvidence(resume);

    var categories = [
      { key: "required_skills", label: "Required skills", weight: 0.30, score: reqSk.score, detail: reqSk.detail, items: reqSk.items },
      { key: "experience", label: "Experience", weight: 0.16, score: exp.score, detail: exp.detail, years: exp.years, reqYears: exp.reqYears },
      { key: "projects", label: "Projects", weight: 0.12, score: proj.score, detail: proj.detail },
      { key: "education", label: "Education", weight: 0.07, score: edu.score, detail: edu.detail },
      { key: "keywords", label: "Job keywords", weight: 0.12, score: kws.score, detail: kws.detail, found: kws.found, missing: kws.missing },
      { key: "responsibilities", label: "Role responsibilities", weight: 0.09, score: resp.score, detail: resp.detail, addressed: resp.addressed, weak: resp.weak },
      { key: "preferred_skills", label: "Preferred skills", weight: 0.08, score: prefSk.score, detail: prefSk.detail, items: prefSk.items },
      { key: "evidence", label: "Evidence quality", weight: 0.06, score: evid.score, detail: evid.detail },
    ];

    // Role-family emphasis nudges the weights slightly.
    if (role && role.emphasis) {
      Object.keys(role.emphasis).forEach(function (k) {
        categories.forEach(function (c) {
          if (c.key.indexOf(k) === 0) c.weight *= role.emphasis[k];
        });
      });
    }
    // Null categories (nothing to judge) don't count against the score.
    var wsum = 0, total = 0;
    categories.forEach(function (c) {
      if (typeof c.score === "number") { wsum += c.weight; total += c.weight * c.score; }
    });
    var overall = wsum > 0 ? Math.round(total / wsum) : 0;
    overall = U.clamp(overall, 4, 96);

    // Confidence in the analysis itself.
    var confidence = "Medium";
    if (resume.meta.wordCount > 250 && jd.meta.wordCount > 120) confidence = "High";
    if (resume.meta.wordCount < 120 || jd.meta.wordCount < 60) confidence = "Low";

    var verdict;
    if (overall >= 80) verdict = "Strong match. You're competitive for this role.";
    else if (overall >= 65) verdict = "Solid foundation. A few specific gaps are holding this back.";
    else if (overall >= 45) verdict = "Real gaps between your resume and what this role asks for.";
    else verdict = "This role expects meaningfully different or deeper experience than your resume currently shows.";

    return {
      overall: overall,
      verdict: verdict,
      confidence: confidence,
      role: role ? { key: role.key, label: role.label } : null,
      categories: categories,
      evidence: evidence,
      disclaimer: "Based on the requirements found in this job description and the evidence present in your resume. An estimate, not a prediction.",
    };
  };

  /* ================= ATS screening ================= */

  JP.computeATS = function (resume, jd, match) {
    var checks = [];
    var c = resume.contact;

    checks.push({
      label: "Contact information",
      status: c.hasEmail && c.hasPhone ? "good" : (c.hasEmail || c.hasPhone) ? "warn" : "bad",
      detail: c.hasEmail && c.hasPhone ? "Email and phone found." :
        c.hasEmail || c.hasPhone ? "Only one of email / phone was found — include both." : "No email or phone detected.",
    });

    var keys = resume.sections.map(function (s) { return s.key; });
    var standard = ["experience", "education", "skills"].filter(function (k) { return keys.indexOf(k) !== -1; }).length;
    checks.push({
      label: "Standard section headings",
      status: standard === 3 ? "good" : standard >= 2 ? "warn" : "bad",
      detail: standard === 3 ? "Experience, Education and Skills headings found." :
        standard + " of 3 standard headings found (Experience, Education, Skills).",
    });

    checks.push({
      label: "Extractable text",
      status: resume.meta.wordCount > 150 ? "good" : "bad",
      detail: resume.meta.wordCount > 150 ? resume.meta.wordCount + " words parsed" + (resume.meta.kind === "pdf" ? " from " + resume.meta.pages + " page(s)." : ".") : "Very little text could be extracted.",
    });

    var exp = resume.experience || [];
    var dated = exp.filter(function (e) { return e.dates; }).length;
    checks.push({
      label: "Chronology",
      status: exp.length === 0 ? "warn" : dated === exp.length ? "good" : dated > 0 ? "warn" : "bad",
      detail: exp.length === 0 ? "No experience entries to date." :
        dated === exp.length ? "All " + exp.length + " experience entries include dates." :
        dated + " of " + exp.length + " entries have parseable dates — unclear dates can break ATS timelines.",
    });

    var kw = match.categories.filter(function (x) { return x.key === "keywords"; })[0];
    var kwScore = kw && typeof kw.score === "number" ? kw.score : 0;
    checks.push({
      label: "Keyword coverage",
      status: kwScore >= 55 ? "good" : kwScore >= 30 ? "warn" : "bad",
      detail: "About " + kwScore + "% of this posting's recurring keywords appear in your resume.",
    });

    var skillCount = (match.evidence.resumeSkills || []).length;
    checks.push({
      label: "Skill visibility",
      status: skillCount >= 8 ? "good" : skillCount >= 4 ? "warn" : "bad",
      detail: skillCount + " recognizable skills found in the text" + (resume.skillsText ? " (Skills section present)." : " — consider adding a Skills section so they're easy to find."),
    });

    var jdSkills = match.evidence.requirements.filter(function (r) { return !r.extra; });
    var jdHit = jdSkills.filter(function (r) { return r.resumeCount > 0; }).length;
    var jdRatio = jdSkills.length ? jdHit / jdSkills.length : 0;
    checks.push({
      label: "Job-specific terminology",
      status: jdRatio >= 0.6 ? "good" : jdRatio >= 0.35 ? "warn" : "bad",
      detail: Math.round(jdRatio * 100) + "% of this job's specific terms appear in your resume.",
    });

    (resume.formattingRisks || []).forEach(function (r) {
      checks.push({ label: "Formatting risk", status: r.severity === "high" ? "bad" : "warn", detail: r.risk });
    });

    checks.push({
      label: "Resume length",
      status: resume.meta.wordCount >= 250 && resume.meta.wordCount <= 950 ? "good" : resume.meta.wordCount < 250 ? "warn" : "warn",
      detail: resume.meta.wordCount + " words. " + (resume.meta.wordCount < 250 ? "Short resumes often lack evidence." : resume.meta.wordCount > 950 ? "Long resumes get skimmed — tighten toward the most relevant evidence." : "A reasonable length for screening."),
    });

    var w = { good: 1, warn: 0.55, bad: 0 };
    var s = 0, n = 0;
    checks.forEach(function (ch) { s += w[ch.status]; n += 1; });
    var pct = n ? Math.round((s / n) * 100) : 0;

    var label = pct >= 80 ? "Strong" : pct >= 60 ? "Adequate" : pct >= 40 ? "Needs work" : "Weak";
    var summary = pct >= 80 ? "Machine-readable and well structured for automated screening."
      : pct >= 60 ? "Mostly readable, with a few fixable issues."
      : "Several issues could prevent this resume from being parsed or matched correctly.";

    return { score: pct, label: label, summary: summary, checks: checks };
  };

  /* ================= Keyword analysis ================= */

  JP.computeKeywords = function (resume, jd, match) {
    var reqs = match.evidence.requirements;
    var out = { requiredFound: [], requiredMissing: [], preferredFound: [], preferredMissing: [] };

    reqs.forEach(function (r) {
      var item = {
        term: r.label,
        jdContext: r.jdContext,
        resumeContext: r.resumeContext,
        resumeCount: r.resumeCount,
        extra: !!r.extra,
      };
      var bucket = r.tier === "preferred" ? (r.resumeCount > 0 ? "preferredFound" : "preferredMissing")
        : (r.resumeCount > 0 ? "requiredFound" : "requiredMissing");
      out[bucket].push(item);
    });

    // Why each missing keyword matters: quote the JD, never invent.
    ["requiredMissing", "preferredMissing"].forEach(function (bucket) {
      out[bucket].forEach(function (item) {
        if (item.jdContext) {
          item.why = "\u201C" + item.jdContext.trim().slice(0, 150) + (item.jdContext.trim().length > 150 ? "…" : "") + "\u201D — from the job description.";
        } else {
          item.why = "Listed under " + (bucket === "requiredMissing" ? "required" : "preferred") + " skills in this posting.";
        }
        item.honest = "Only add this if you genuinely have experience with it. If not, don't list it — address it in a cover letter or be ready to discuss adjacent experience.";
      });
    });
    return out;
  };
})();
