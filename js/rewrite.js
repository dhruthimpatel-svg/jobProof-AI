/* ============================================================
   JobProof AI — js/rewrite.js
   Natural resume rewriting + humanizer.
   Uses ONLY the user's actual content. It restructures and
   tightens bullets; it never invents metrics, employers,
   technologies, or outcomes. Every rewrite is offered as a
   suggestion (Accept / Edit / Keep) — never auto-applied.
   ============================================================ */

(function () {
  "use strict";

  var JP = window.JP;
  var U = JP.util;
  var INTERN = JP._parseInternals;

  /* ================= Humanizer ================= */

  // Phrases that mark text as machine-written. Ordered: the earlier
  // replacements run first, so later patterns see cleaned text.
  var HUMANIZE_RULES = [
    // Empty buzzwords / corporate filler
    { re: /\b(leverag(e|ed|ing))\b/gi, to: "use" },
    { re: /\butiliz(e|ed|ing)\b/gi, to: "use" },
    { re: /\bsynerg(y|ies|istic)\b/gi, to: "collaboration" },
    { re: /\b(seamlessly|seamless)\b/gi, to: "" },
    { re: /\b(cutting.edge|state.of.the.art)\b/gi, to: "modern" },
    { re: /\b(world.class|best.in.class|industry.leading)\b/gi, to: "" },
    { re: /\b(robust)\b/gi, to: "reliable" },
    { re: /\bholistic(ally)?\b/gi, to: "" },
    { re: /\bdeliv(er|ered|ering) (value|impact)\b/gi, to: "improved results" },
    { re: /\b(drive|drove|driving) (excellence|innovation|success)\b/gi, to: "improved results" },
    { re: /\bpassionate about\b/gi, to: "focused on" },
    { re: /\bresults.driven\b/gi, to: "" },
    { re: /\bself.starter\b/gi, to: "" },
    { re: /\bteam player\b/gi, to: "" },
    { re: /\bhardworking\b/gi, to: "" },
    { re: /\bdetail.oriented\b/gi, to: "" },
    { re: /\bhighly (motivated|skilled|experienced)\b/gi, to: "" },
    { re: /\b(extremely|incredibly|highly) (effective|efficient|proficient)\b/gi, to: "effective" },
    { re: /\bin ?order ?to\b/gi, to: "to" },
    { re: /\bdue to the fact that\b/gi, to: "because" },
    { re: /\bwith respect to\b/gi, to: "for" },
    { re: /\ba wide (range|variety) of\b/gi, to: "several" },
    { re: /\bvarious (tasks|responsibilities|duties)\b/gi, to: "core tasks" },
    { re: /\b(responsibilities included|duties included)\b/gi, to: "handled" },
    { re: /\bplayed a (key|vital|crucial|pivotal) role in\b/gi, to: "led" },
    { re: /\binstrumental in\b/gi, to: "drove" },
    { re: /\bsuccessfully\b/gi, to: "" },
    { re: /\beffectively\b/gi, to: "" },
    { re: /\befficiently\b/gi, to: "" },
    { re: /\bactively (participated|involved)\b/gi, to: "took part" },
    { re: /\bhelped (to|in)? ?(facilitate)\b/gi, to: "supported" },
    { re: /\bfacilitated\b/gi, to: "ran" },
    { re: /\bendeavou?rs?\b/gi, to: "work" },
    { re: /\butili[sz]ing\b/gi, to: "using" },
  ];

  // Alternate openers so consecutive bullets don't all start the same way.
  var VARIED_STARTS = ["Built", "Developed", "Designed", "Delivered", "Improved", "Automated"];

  JP.humanize = function (text) {
    var t = String(text || "").trim();
    HUMANIZE_RULES.forEach(function (rule) {
      t = t.replace(rule.re, rule.to);
    });
    // Collapse artifacts from deletions.
    t = t.replace(/\s{2,}/g, " ")
      .replace(/\s+([,.;:])/g, "$1")
      .replace(/^[,;:.\s]+/, "")
      .replace(/([,;:]){2,}/g, "$1")
      .trim();
    // Capitalize first letter.
    if (t) t = t.charAt(0).toUpperCase() + t.slice(1);
    return t;
  };

  /* ================= Rewrite candidates ================= */

  // Which JD terms does this bullet relate to? Only these may be
  // mentioned in a rewrite, because the user demonstrably used them.
  function relatedJdTerms(bulletText, requirements) {
    return requirements.filter(function (r) {
      return r.resumeCount > 0 && TAXmatch(r.label, bulletText);
    });
  }

  function TAXmatch(label, text) {
    try {
      return JP.TAX.matchKeyword(text, label) > 0;
    } catch (e) {
      return false;
    }
  }

  function techOf(bulletText) {
    // Technologies the bullet itself names (safe to reference).
    var found = JP.TAX.matchAll(bulletText);
    return found.map(function (f) { return f.label; });
  }

  /*
   * Rewrite one bullet. Strategy depends on what the bullet gives us:
   *  - weak opener + tech present  → strong verb + tech + original intent
   *  - has a metric but buried     → lead with outcome
   *  - passive "responsible for"   → convert to owned action
   *  - otherwise                   → tighten, dedupe, humanize
   * Returns null when there's nothing honest to improve.
   */
  JP.rewriteBullet = function (bullet, jd) {
    var orig = bullet.text.trim();
    var low = U.norm(orig);

    // Already strong: starts with action verb, has a metric, reasonable length.
    if (bullet.strongStart && bullet.hasMetric && !bullet.long && !bullet.short) {
      return null; // no change needed — offer nothing rather than churn
    }

    var tech = techOf(orig);
    var techLabel = tech.length ? tech[0] : null;
    var metric = bullet.metric;

    var rewritten = null;

    if (INTERN.WEAK_STARTS.test(orig)) {
      // "Worked on cleaning and analyzing data" → "Cleaned and analyzed data"
      var stripped = orig.replace(INTERN.WEAK_STARTS, "");
      stripped = stripped.replace(/^\s*(on|with|in|for|the)\s+/i, "");
      stripped = stripped.replace(/^\s+/, "");
      var pastified = stripped.replace(/\b([a-zA-Z]+ing)\b/g, function (w) {
        var past = GERUND_PAST[w.toLowerCase()];
        if (!past) return w;
        /* lowercase mid-sentence; humanize() re-capitalizes the first letter */
        return past.charAt(0).toLowerCase() + past.slice(1);
      });
      var firstWord = (stripped.match(/^[a-zA-Z]+/) || [""])[0].toLowerCase();
      if (GERUND_PAST[firstWord]) {
        rewritten = pastified;
      } else if (/ing$/.test(firstWord)) {
        // A gerund we can't conjugate confidently — offer nothing rather
        // than risk a broken sentence.
        return null;
      } else {
        var verb = pickVerb(pastified.toLowerCase(), techLabel);
        rewritten = verb + " " + stripped;
      }
    } else if (/^responsible for/i.test(low)) {
      var rest = orig.replace(/^responsible for\s*/i, "");
      var firstRaw = (rest.match(/^[a-zA-Z]+/) || [""])[0].toLowerCase();
      if (GERUND_PAST[firstRaw]) {
        // "Responsible for generating weekly reports" → "Generated weekly reports"
        rewritten = rest.replace(/^[a-zA-Z]+/, GERUND_PAST[firstRaw]);
      } else {
        rewritten = "Owned " + rest;
      }
    } else if (/^(assisted|helped)\b/i.test(low)) {
      rewritten = "Supported " + orig.replace(/^(assisted|helped)( with| in)?\s*/i, "");
    } else if (bullet.long) {
      // Too long: cut filler, keep substance.
      rewritten = shorten(orig);
    } else {
      // Metric present but odd phrasing, or already acceptable:
      // no transformation is safe enough to be worth churning.
      return null;
    }

    if (!rewritten || U.norm(rewritten) === low) return null;

    // Humanize pass — never alters facts, only phrasing.
    rewritten = JP.humanize(rewritten);
    if (!rewritten || U.norm(rewritten) === low) return null;
    if (rewritten.split(/\s+/).length < 5) return null;

    return {
      before: orig,
      after: rewritten,
      note: rewriteNote(bullet, rewritten, techLabel, metric),
    };
  };

  // Common gerunds the weak-opener path may need to convert to a past
  // tense. Anything not listed here is left untouched.
  var GERUND_PAST = {
    cleaning: "Cleaned", analyzing: "Analyzed", analysing: "Analysed",
    building: "Built", developing: "Developed", designing: "Designed",
    managing: "Managed", creating: "Created", testing: "Tested",
    deploying: "Deployed", writing: "Wrote", maintaining: "Maintained",
    improving: "Improved", supporting: "Supported", leading: "Led",
    handling: "Handled", automating: "Automated", migrating: "Migrated",
    debugging: "Debugged", documenting: "Documented", monitoring: "Monitored",
    training: "Trained", evaluating: "Evaluated", optimizing: "Optimized",
  };

  function pickVerb(lowText, techLabel) {
    if (/\bmachine learning|deep learning|neural|ml model/.test(lowText)) return "Developed";
    if (/\bmodel|predict|forecast|classif/.test(lowText)) return "Developed";
    if (/\bdashboard|report|visual/.test(lowText)) return "Built";
    if (/\btest|qa|bug/.test(lowText)) return "Automated";
    if (/\bdeploy|release|ci|cd\b/.test(lowText)) return "Shipped";
    if (/\bdata|pipeline|etl/.test(lowText)) return "Processed";
    if (/\bteam|mentor|lead|junior/.test(lowText)) return "Led";
    return "Built";
  }

  function shorten(text) {
    var cut = text
      .replace(/\b(in order to|so as to)\b/gi, "to")
      .replace(/\b(responsibilities included|duties included)\b/gi, "handled")
      .replace(/\b(daily|regularly|consistently|on a (daily|regular) basis)\b,?/gi, "")
      .replace(/\b(as well as)\b/gi, "and")
      .replace(/\b(along with)\b/gi, "with")
      .replace(/\s{2,}/g, " ")
      .trim();
    // If still very long, cut at the last sentence boundary under ~30 words.
    var words = cut.split(/\s+/);
    if (words.length > 34) {
      cut = words.slice(0, 32).join(" ").replace(/[,;:]$/, "") + ".";
    }
    return cut;
  }

  function rewriteNote(bullet, after, techLabel, metric) {
    var changes = [];
    if (bullet.weakStart) changes.push("replaced the passive opener");
    if (bullet.long) changes.push("cut filler");
    if (bullet.hasMetric) changes.push("kept your real number" + (metric ? " (" + metric + ")" : ""));
    else changes.push("no numbers were added — none existed to use");
    if (techLabel) changes.push("kept " + techLabel + " in context");
    return changes.join(", ");
  }

  /*
   * Build the full rewrite offer list for a resume + JD.
   * Each item: { bulletIndex, sectionName, before, after, note }
   * Nothing here is applied automatically.
   */
  JP.buildRewrites = function (resume, jd) {
    var offers = [];
    var reqs = jd ? (JP._lastEvidence ? JP._lastEvidence.requirements : []) : [];

    function consider(bullets, sectionName, startIndex) {
      bullets.forEach(function (b, i) {
        var offer = JP.rewriteBullet(b, jd);
        if (offer) {
          offers.push({
            bulletIndex: startIndex + i,
            section: sectionName,
            before: offer.before,
            after: offer.after,
            note: offer.note,
          });
        }
      });
    }

    var idx = 0;
    resume.experience.forEach(function (e, ei) {
      consider(e.bullets.map(INTERN.analyzeBullet), e.company || e.title || ("Experience " + (ei + 1)), idx);
      idx += e.bullets.length;
    });
    resume.projects.forEach(function (p, pi) {
      consider(p.bullets.map(INTERN.analyzeBullet), p.name || ("Project " + (pi + 1)), idx);
      idx += p.bullets.length;
    });

    return offers;
  };

  /* ================= Summary line rewriting ================= */

  JP.rewriteSummary = function (resume, jd, match) {
    var lines = resume.sectionMap.summary || [];
    if (!lines.length) return null;

    var original = lines.join(" ").trim();
    if (!original || original.length < 40) return null;

    // Build a truthful one-liner from what the resume actually shows.
    var parts = [];
    var edu = resume.education && resume.education[0];
    var skills = (match.evidence.resumeSkills || []).slice(0, 4).map(function (s) { return s.label; });
    var years = null;
    var expCat = match.categories.filter(function (c) { return c.key === "experience"; })[0];
    if (expCat) years = expCat.years;

    if (edu && edu.degree) parts.push(U.titleCase(edu.degree) + (edu.institution ? " student at " + edu.institution : ""));
    else if (years != null && years > 0) parts.push("Professional with about " + Math.round(years) + " years of experience");
    else if (resume.projects && resume.projects.length) {
      parts.push("Early-career profile built on " + resume.projects.length + " hands-on project" + (resume.projects.length === 1 ? "" : "s"));
    }
    if (!parts.length) return null; // nothing factual to say — offer nothing

    if (skills.length) parts.push("working with " + skills.join(", "));
    if (jd && jd.title) parts.push("targeting " + jd.title + " roles");

    var after = parts.join(", ").replace(/\s{2,}/g, " ") + ".";
    after = JP.humanize(after);
    if (U.norm(after) === U.norm(original)) return null;
    return { before: original, after: after, note: "Rebuilt from facts already in your resume: education, dated experience and named skills only." };
  };
})();
