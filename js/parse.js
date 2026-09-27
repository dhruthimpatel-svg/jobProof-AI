/* ============================================================
   JobProof AI — js/parse.js
   Resume parsing: sections, contact info, experience,
   education, projects, skills, bullet analysis, formatting risks.
   Never invents content — it only structures what's there.
   ============================================================ */

(function () {
  "use strict";

  var JP = window.JP;
  var U = JP.util;

  /* ---------------- Section detection ---------------- */

  var SECTION_PATTERNS = [
    { key: "summary", label: "Summary", re: /^(career\s+)?(summary|objective|profile|professional\s+(summary|profile)|about\s+me|about)\b/i },
    { key: "experience", label: "Experience", re: /^(work\s+|professional\s+|relevant\s+|employment\s+)?(experience|history|work\s+history|employment)\b/i },
    { key: "education", label: "Education", re: /^(education|academic\s+(background|qualifications?))\b/i },
    { key: "projects", label: "Projects", re: /^(projects?|personal\s+projects?|academic\s+projects?|selected\s+projects?)\b/i },
    { key: "skills", label: "Skills", re: /^(technical\s+)?(skills|core\s+(competencies|skills)|skills?(\s*&\s*(tools|interests))?|technologies|toolkit)\b/i },
    { key: "certifications", label: "Certifications", re: /^(certifications?|licenses?|certificates?|courses?(\s*&\s*certifications?)?)\b/i },
    { key: "achievements", label: "Achievements", re: /^(achievements?|awards?|honors?|honours?|accomplishments?|extra.?curricular)\b/i },
    { key: "links", label: "Links", re: /^(links?|portfolio|contact)\b/i },
    { key: "publications", label: "Publications", re: /^(publications?|papers?|research)\b/i },
    { key: "volunteer", label: "Volunteering", re: /^(volunteer(ing)?|community)\b/i },
  ];

  function detectSections(lines) {
    var sections = [];
    var current = { key: "header", label: "Header", lines: [] };

    lines.forEach(function (raw) {
      var line = raw.replace(/\s+/g, " ").trim();
      if (!line) return;
      var clean = line.replace(/[^a-zA-Z\s]/g, " ").trim();
      var matched = null;
      if (clean.length <= 40) {
        for (var i = 0; i < SECTION_PATTERNS.length; i++) {
          if (SECTION_PATTERNS[i].re.test(clean)) { matched = SECTION_PATTERNS[i]; break; }
        }
      }
      if (matched) {
        if (current.lines.length || current.key === "header") sections.push(current);
        current = { key: matched.key, label: matched.label, lines: [] };
      } else {
        current.lines.push(line);
      }
    });
    sections.push(current);
    return sections.filter(function (s) { return s.lines.length > 0 || s.key === "header"; });
  }

  function sectionText(sections, key) {
    var out = [];
    sections.forEach(function (s) {
      if (s.key === key) out = out.concat(s.lines);
    });
    return out.join("\n");
  }

  /* ---------------- Contact info ---------------- */

  function extractContact(lines) {
    var head = lines.slice(0, 12).join("\n");
    var all = lines.join("\n");
    var contact = {};

    var email = all.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (email) contact.email = email[0];

    var phone = all.match(/(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/);
    if (phone) contact.phone = phone[0].trim();

    var gh = all.match(/(?:github\.com\/)([A-Za-z0-9_-]+)/i);
    if (gh) contact.github = "github.com/" + gh[1];

    var li = all.match(/(?:linkedin\.com\/in\/)([A-Za-z0-9_-]+)/i);
    if (li) contact.linkedin = "linkedin.com/in/" + li[1];

    var portfolio = all.match(/\b((?:https?:\/\/)?(?:www\.)?[a-z0-9-]+\.(?:io|dev|me|com|net|xyz|app)\/?[a-z0-9-]*)\b/i);
    if (portfolio && !/github|linkedin/i.test(portfolio[1])) contact.portfolio = portfolio[1];

    // Location: line containing City, ST or City, Country patterns.
    var loc = head.match(/([A-Z][a-zA-Z .'-]+,\s*(?:[A-Z]{2}\b|[A-Z][a-zA-Z]+))\s*(?:[•|]|\n|$)/);
    if (loc && loc[1].length < 40) contact.location = loc[1].trim();

    contact.hasEmail = !!contact.email;
    contact.hasPhone = !!contact.phone;
    contact.hasLinkedIn = !!contact.linkedin;
    contact.hasGithub = !!contact.github;
    return contact;
  }

  /* ---------------- Name ---------------- */

  function extractName(lines) {
    for (var i = 0; i < Math.min(5, lines.length); i++) {
      var l = lines[i].trim();
      if (!l || l.length > 48) continue;
      if (/[a-zA-Z]/.test(l) && !/@|\d{3}|http/i.test(l)) {
        var words = l.split(/\s+/);
        if (words.length >= 2 && words.length <= 5) {
          return words.map(function (w) { return w.replace(/[^A-Za-z'.-]/g, ""); }).filter(Boolean).join(" ");
        }
      }
    }
    return null;
  }

  /* ---------------- Experience entries ---------------- */

  var MONTHS = "(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*";
  // Regex literal on purpose: building this from string fragments made the
  // backslash escaping fragile (\d was silently becoming a bare d).
  var DATE_RE = /((jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*'?\d{2,4}\s*(–|—|-|to)\s*((jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*'?\d{2,4}|present|current|now|date))|((19|20)\d{2}\s*(–|—|-|to)\s*((19|20)\d{2}|present|current))/i;

  function parseExperience(sections) {
    var text = sectionText(sections, "experience");
    if (!text) return [];
    var lines = text.split("\n");
    var entries = [];
    var cur = null;

    lines.forEach(function (line) {
      var l = line.trim();
      if (!l) return;
      if (DATE_RE.test(l)) {
        if (cur) entries.push(cur);
        cur = { header: "", dates: l, bullets: [], raw: [] };
        var headerPart = l.replace(DATE_RE, "").replace(/[|•·–—-]{1,2}\s*$/, "").trim();
        cur.header = headerPart;
        cur.raw.push(l);
        return;
      }
      if (cur) {
        if (/^[•\-*·‣◦]|^\d+[.)]\s/.test(l)) {
          cur.bullets.push(l.replace(/^[•\-*·‣◦]\s*/, "").replace(/^\d+[.)]\s*/, ""));
        } else if (l.length < 100 && cur.bullets.length === 0 && !cur.title && /[a-z]/.test(l)) {
          if (!cur.header) cur.header = l;
          else if (!cur.title) cur.title = l;
        } else {
          cur.bullets.push(l);
        }
        cur.raw.push(l);
      }
    });
    if (cur) entries.push(cur);
    entries.forEach(function (e) {
      e.company = e.header || e.title || null;
      e.title = e.title || null;
    });
    return entries;
  }

  /* ---------------- Education ---------------- */

  var DEGREE_RE = /\b(b\.?tech|b\.?e\.?|bachelor(?:'s)?|b\.?sc|b\.?a\.?|m\.?tech|m\.?e\.?|master(?:'s)?|m\.?sc|m\.?a\.?|mba|ph\.?d|doctorate|diploma|associate|high school|secondary school|class (?:x|xi|xii|10|12))\b/i;

  function parseEducation(sections) {
    var text = sectionText(sections, "education");
    if (!text) return [];
    var lines = text.split("\n");
    var entries = [];
    var cur = null;

    lines.forEach(function (line) {
      var l = line.trim();
      if (!l) return;
      if (DEGREE_RE.test(l) || DATE_RE.test(l)) {
        if (cur) entries.push(cur);
        cur = { text: l, degree: DEGREE_RE.test(l) ? (l.match(DEGREE_RE) || [null])[0] : null, dates: (l.match(DATE_RE) || [null])[0], institution: null };
      } else if (cur) {
        if (/^relevant\s+coursework\b/i.test(l)) {
          cur.text += "\n" + l; /* coursework detail — not an institution */
        } else {
          cur.institution = cur.institution ? cur.institution + " " + l : l;
          cur.text += "\n" + l;
        }
      } else {
        entries.push({ text: l, degree: null, dates: null, institution: null });
      }
    });
    if (cur) entries.push(cur);
    return entries;
  }

  /* ---------------- Projects ---------------- */

  function parseProjects(sections) {
    var text = sectionText(sections, "projects");
    if (!text) return [];
    var lines = text.split("\n");
    var entries = [];
    var cur = null;

    lines.forEach(function (line) {
      var l = line.trim();
      if (!l) return;
      var isHead = l.length < 80 && !/[.!?]$/.test(l) && !/^[•\-*·]/.test(l);
      if (isHead && (cur === null || cur.bullets.length > 0)) {
        if (cur) entries.push(cur);
        cur = { name: l.replace(/[|:•].*$/, "").trim(), bullets: [], tech: [] };
      } else if (cur) {
        cur.bullets.push(l.replace(/^[•\-*·‣◦]\s*/, ""));
      } else {
        entries.push({ name: l.slice(0, 60), bullets: [], tech: [] });
      }
    });
    if (cur) entries.push(cur);
    return entries;
  }

  /* ---------------- Bullets ---------------- */

  var NUM_RE = /(\d+(?:\.\d+)?\s?%|\$\s?\d[\d,\.]*(?:\s?[kmb]\b)?|\b\d[\d,]*\s?\+|\b\d{2,}\b(?:\s?(?:users|customers|clients|students|records|rows|hours|days|weeks|projects|models|apps|members|people|countries|cities))?|\b\d+(?:\.\d+)?\s?(?:x|times)\b)/i;

  var WEAK_STARTS = /^(worked on|worked with|responsible for|helped (with|to)?|assisted (with|in)?|involved in|participated in|part of|took part in|was part of|duties included|tasked with|did |made |used |handled|various|several|multiple tasks|day.?to.?day)\b/i;

  var ACTION_STARTS = /^(built|developed|designed|created|implemented|led|launched|delivered|improved|reduced|increased|automated|migrated|optimized|optimised|architected|deployed|shipped|trained|analyzed|analysed|managed|owned|drove|streamlined|integrated|mentored|established|initiated|scaled|refactored|engineered|presented|published|achieved)\b/i;

  function analyzeBullet(b) {
    var l = b.trim();
    return {
      text: l,
      hasMetric: NUM_RE.test(l),
      metric: (l.match(NUM_RE) || [null])[0],
      weakStart: WEAK_STARTS.test(l),
      strongStart: ACTION_STARTS.test(l),
      long: l.split(/\s+/).length > 34,
      short: l.split(/\s+/).length < 6,
    };
  }

  /* ---------------- Formatting risks (ATS-oriented) ---------------- */

  function detectFormattingRisks(lines, sections, fullText) {
    var risks = [];
    var keys = sections.map(function (s) { return s.key; });

    if (!keys.some(function (k) { return /experience/.test(k); })) {
      risks.push({ risk: "No standard Experience section detected", severity: "high" });
    }
    if (!keys.some(function (k) { return /education/.test(k); })) {
      risks.push({ risk: "No Education section detected", severity: "medium" });
    }
    if (!keys.some(function (k) { return /skills/.test(k); })) {
      risks.push({ risk: "No Skills section detected — ATS keyword matching relies on it", severity: "medium" });
    }

    var bulletCount = lines.filter(function (l) { return /^[•\-*·‣◦]\s|^\d+[.)]\s/.test(l.trim()); }).length;
    if (bulletCount === 0) {
      risks.push({ risk: "No bullet points found — dense paragraphs are harder for both ATS and recruiters to scan", severity: "medium" });
    } else if (bulletCount < 4) {
      risks.push({ risk: "Very few bullet points (" + bulletCount + ") — most roles expect scannable achievement bullets", severity: "low" });
    }

    if (/\t{2,}/.test(fullText) || / {6,}\S/.test(fullText)) {
      risks.push({ risk: "Wide spacing or tab alignment detected — may indicate layout tables that can scramble in ATS parsing", severity: "low" });
    }

    var unusual = sections.filter(function (s) {
      return ["experience", "education", "skills", "projects", "summary", "certifications", "achievements", "header", "links", "publications", "volunteer"].indexOf(s.key) === -1;
    });
    if (unusual.length) {
      risks.push({ risk: "Unusual section headings: " + unusual.map(function (s) { return "\u201C" + s.label + "\u201D"; }).join(", "), severity: "low" });
    }
    return risks;
  }

  /* ---------------- Main entry ---------------- */

  JP.parseResume = function (rawText, meta) {
    var lines = String(rawText || "").split(/\r?\n/).map(function (l) { return l.replace(/\s+$/g, ""); });
    var sections = detectSections(lines);
    var experience = parseExperience(sections);
    var education = parseEducation(sections);
    var projects = parseProjects(sections);

    var skillsSection = sectionText(sections, "skills");
    /* Structured skill list: split the skills section on separators,
       drop section headers, keep short single tokens/phrases. Used by
       the verifier (resume claims), interview targeting and agents. */
    var skills = [];
    skillsSection.split(/[,;•|]+|\u00b7|\n/).forEach(function (part) {
      var label = part.replace(/\s+/g, " ").trim().replace(/[.]$/, "");
      if (!label) return;
      if (/^(technical\s+)?skills?$/i.test(label)) return; /* header remnant */
      if (label.length > 40 || label.split(/\s+/).length > 5) return;
      skills.push({ label: label });
    });
    var allBullets = [];
    experience.forEach(function (e) {
      e.bullets.forEach(function (b) { allBullets.push(analyzeBullet(b)); });
    });
    projects.forEach(function (p) {
      p.bullets.forEach(function (b) { allBullets.push(analyzeBullet(b)); });
    });

    var wordCount = (rawText.match(/\S+/g) || []).length;

    return {
      meta: {
        fileName: meta && meta.fileName,
        kind: meta && meta.kind,
        pages: meta && meta.pages,
        size: meta && meta.size,
        uploadedAt: new Date().toISOString(),
        wordCount: wordCount,
      },
      text: rawText,
      name: extractName(lines),
      contact: extractContact(lines),
      sections: sections.map(function (s) { return { key: s.key, label: s.label, lineCount: s.lines.length }; }),
      sectionMap: (function () {
        var m = {};
        sections.forEach(function (s) { m[s.key] = s.lines; });
        return m;
      })(),
      experience: experience,
      education: education,
      projects: projects,
      skillsText: skillsSection,
      skills: skills,
      bullets: allBullets,
      formattingRisks: detectFormattingRisks(lines, sections, rawText),
    };
  };

  /* exposed for reuse */
  JP._parseInternals = {
    DATE_RE: DATE_RE,
    DEGREE_RE: DEGREE_RE,
    NUM_RE: NUM_RE,
    WEAK_STARTS: WEAK_STARTS,
    ACTION_STARTS: ACTION_STARTS,
    analyzeBullet: analyzeBullet,
    sectionText: sectionText,
  };
})();
