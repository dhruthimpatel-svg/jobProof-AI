/* ============================================================
   JobProof AI — js/jd.js
   Job description parsing. Separates Required from Preferred,
   extracts concrete requirement signals (skills, years, degrees,
   certifications) and ranks explicit keywords. Anything not in
   the text stays "unknown" — the JD is never invented.
   ============================================================ */

(function () {
  "use strict";

  var JP = window.JP;
  var U = JP.util;
  var TAX = JP.TAX;

  /* ---------------- JD section splitting ---------------- */

  var JD_SECTIONS = [
    { key: "responsibilities", label: "Responsibilities", re: /^(what you'?ll (be )?(do|work on)|responsibilit(y|ies)|the role|about the (role|job)|your (role|responsibilities)|day.?to.?day|duties)\b/i },
    { key: "requirements", label: "Requirements", re: /^(what (we|you)('|’)?(re|are)? (looking for|need)|requirements|qualifications|required (skills|qualifications|experience)|must.?haves?|who you are|you have|about you|skills (and|&) (qualifications|experience)|we'?re looking for)\b/i },
    { key: "preferred", label: "Preferred", re: /^(preferred( qualifications| skills)?|nice to haves?|bonus( points| skills)?|plus(es)?|good to have|desirable)\b/i },
    { key: "benefits", label: "Benefits", re: /^(benefits|perks|what we offer|compensation|salary)\b/i },
    { key: "about", label: "About", re: /^(about (us|the company|our team)|the company|who we are|our mission)\b/i },
  ];

  function splitJdSections(lines) {
    var sections = [];
    var current = { key: "intro", label: "Intro", lines: [] };
    lines.forEach(function (raw) {
      var line = String(raw || "").replace(/\s+/g, " ").trim();
      if (!line) return;
      var clean = line.replace(/[^a-zA-Z\s'’]/g, " ").trim();
      var matched = null;
      if (clean.length <= 50) {
        for (var i = 0; i < JD_SECTIONS.length; i++) {
          if (JD_SECTIONS[i].re.test(clean)) { matched = JD_SECTIONS[i]; break; }
        }
      }
      if (matched) {
        sections.push(current);
        current = { key: matched.key, label: matched.label, lines: [] };
      } else {
        current.lines.push(line);
      }
    });
    sections.push(current);
    return sections.filter(function (s) { return s.lines.length > 0; });
  }

  function jdSectionText(sections, keys) {
    var out = [];
    sections.forEach(function (s) {
      if (keys.indexOf(s.key) !== -1) out = out.concat(s.lines);
    });
    return out;
  }

  /* ---------------- Title & company detection ---------------- */

  function detectTitle(text) {
    // "Job Title: X" / "Position: X" / "Role: X"
    var m = text.match(/^\s*(job\s*title|position|role|opening)\s*[:\-]\s*(.+)$/im);
    if (m) return m[2].trim().slice(0, 80);
    // First line that looks like a bare job title.
    var firstLines = text.split(/\r?\n/).slice(0, 4).map(function (l) { return l.trim(); });
    for (var i = 0; i < firstLines.length; i++) {
      var l = firstLines[i];
      if (!l || l.length > 70) continue;
      if (/(engineer|developer|scientist|analyst|manager|designer|architect|intern|specialist|consultant|administrator|lead|director)/i.test(l) && !/[.!?]$/.test(l) && !/about|company|we are|join/i.test(l)) {
        return l.replace(/\s*[|(–—-].*$/, "").trim();
      }
    }
    return null;
  }

  function detectCompany(text) {
    var m = text.match(/^\s*company\s*[:\-]\s*(.+)$/im) ||
            text.match(/at\s+([A-Z][A-Za-z0-9&.'\- ]{1,40})\s*[,\n]/);
    if (m) return m[1].trim();
    var m2 = text.match(/([A-Z][A-Za-z0-9&.'\- ]{2,40})\s+is (a|an|the)\b/);
    if (m2 && !/^(we|it|this|the|our)$/i.test(m2[1])) return m2[1].trim();
    return null;
  }

  /* ---------------- Experience requirement ---------------- */

  function extractYears(text) {
    var t = U.norm(text);
    var patterns = [
      /\b(\d{1,2})\s*\+\s*(?:years?|yrs)\b/g,
      /\bat least\s+(\d{1,2})\s*(?:years?|yrs)\b/g,
      /\b(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\s*(?:years?|yrs)\b/g,
      /\b(?:minimum|min(?:imum)? of|over|more than)\s+(\d{1,2})\s*(?:years?|yrs)\b/g,
      /\b(\d{1,2})\s*(?:years?|yrs)\s+(?:of\s+)?(?:relevant\s+|professional\s+|industry\s+|hands.?on\s+|work\s+)?experience\b/g,
    ];
    var best = null;
    patterns.forEach(function (p) {
      var m;
      while ((m = p.exec(t)) !== null) {
        var lo = parseInt(m[1], 10);
        if (!isNaN(lo) && lo <= 15) {
          var hi = m[2] ? parseInt(m[2], 10) : null;
          if (best === null || lo < best.min) best = { min: lo, max: hi, raw: m[0] };
        }
      }
    });
    return best; // null → no explicit requirement
  }

  function seniorityOf(text, title) {
    var t = U.norm(title || "") + " " + U.norm(text || "").slice(0, 400);
    if (/\b(intern|internship|trainee)\b/.test(t)) return "Internship";
    if (/\b(junior|entry.?level|graduate|fresher|associate)\b/.test(t)) return "Junior";
    if (/\b(principal|staff|distinguished)\b/.test(t)) return "Senior+";
    if (/\b(senior|sr\.?|lead|manager|head of)\b/.test(t)) return "Mid-Senior";
    return null;
  }

  /* ---------------- Education requirement ---------------- */

  var EDU_PATTERNS = [
    { level: "PhD", re: /\b(ph\.?d|doctorate|doctoral)\b/i },
    { level: "Master's", re: /\b(master'?s?(?:'s)?|m\.?s\.?c?\b|m\.?tech|m\.?e\.?\b|mba|post.?graduate|postgraduate)\b/i },
    { level: "Bachelor's", re: /\b(bachelor'?s?(?:'s)?|b\.?tech|b\.?e\.?\b|b\.?sc|undergraduate|b\.?a\.?\b|4.?year degree)\b/i },
  ];

  function extractEducation(text) {
    for (var i = 0; i < EDU_PATTERNS.length; i++) {
      var m = text.match(EDU_PATTERNS[i].re);
      if (m) {
        var idx = m.index;
        var sentence = text.slice(Math.max(0, text.lastIndexOf(".", idx - 1) + 1), idx + 120).trim();
        return { level: EDU_PATTERNS[i].level, raw: m[0], context: sentence.slice(0, 160) };
      }
    }
    if (/\bdegree\b/i.test(text)) {
      return { level: "Degree (field unspecified)", raw: "degree", context: null };
    }
    return { level: null, raw: null, context: null };
  }

  /* ---------------- Certifications ---------------- */

  function extractCertifications(text) {
    var lines = text.split(/\r?\n/);
    var certs = [];
    var re = /\b(certif(icate|ication|ied)|license|credentials?)\b/i;
    lines.forEach(function (l) {
      if (re.test(l) && l.trim().length < 220) {
        var s = l.trim().replace(/^[-•*\u2022]\s*/, "");
        if (s && certs.indexOf(s) === -1) certs.push(s);
      }
    });
    return certs.slice(0, 6);
  }

  /* ---------------- Ranked keywords ---------------- */

  var STOPWORDS = new Set(("a,an,the,and,or,but,if,then,else,for,to,of,in,on,at,by,with,from,as,is,are,was,were,be,been,being," +
    "this,that,these,those,it,its,we,our,us,you,your,you're,they,their,them,he,she,his,her,i,me,my," +
    "will,would,should,can,could,may,might,must,shall,do,does,did,have,has,had,not,no,yes," +
    "about,into,over,under,again,further,once,here,there,when,where,why,how,all,any,both,each,few,more,most,other,some,such,only,own,same,so,than,too,very," +
    "work,working,works,team,teams,role,job,position,company,candidate,candidates,applicant,applicants," +
    "experience,years,year,ability,skills,skill,knowledge,understanding,plus,strong,excellent,good,great," +
    "including,include,includes,using,use,used,new,well,also,who,what,across,within,per,via,while,help," +
    "join,looking,apply,application,opportunity,benefits,salary,equal,employer,please,etc,based,capable," +
    "responsibilities,responsibility,requirements,required,preferred,qualification,qualifications,ideal," +
    "get,make,made,like,love,want,need,needs,daily,day,time,times,part,full,remote,hybrid,onsite,office").split(","));

  function rankKeywords(text, limit) {
    var words = U.norm(text).match(/[a-z][a-z0-9+#.\-]{1,30}/g) || [];
    var freq = {};
    words.forEach(function (w) {
      var clean = w.replace(/[-.]+$/, "");
      if (clean.length < 3 || STOPWORDS.has(clean)) return;
      freq[clean] = (freq[clean] || 0) + 1;
    });
    return Object.keys(freq)
      .sort(function (a, b) { return freq[b] - freq[a] || a.localeCompare(b); })
      .slice(0, limit || 30)
      .map(function (w) { return { word: w, count: freq[w] }; });
  }

  /* ---------------- Main entry ---------------- */

  JP.parseJobDescription = function (rawText, details) {
    details = details || {};
    var text = String(rawText || "").trim();
    var lines = text.split(/\r?\n/);
    var sections = splitJdSections(lines);

    var title = details.title || detectTitle(text);
    var company = details.company || detectCompany(text);

    var reqLines = jdSectionText(sections, ["requirements"]);
    var prefLines = jdSectionText(sections, ["preferred"]);
    var respLines = jdSectionText(sections, ["responsibilities"]);

    // If no explicit "Requirements" section, treat the whole JD as the requirement source.
    var requirementText = reqLines.length ? reqLines.join("\n") : text;
    var preferredText = prefLines.join("\n");

    var years = extractYears(requirementText);
    var edu = extractEducation(requirementText);

    return {
      meta: {
        mode: details.mode || "text",
        url: details.url || null,
        parsedAt: new Date().toISOString(),
        wordCount: (text.match(/\S+/g) || []).length,
      },
      text: text,
      title: title,
      company: company,
      sections: sections.map(function (s) { return { key: s.key, label: s.label, lineCount: s.lines.length }; }),
      responsibilities: respLines,
      requirementLines: reqLines,
      preferredLines: prefLines,
      requirements: {
        years: years,
        seniority: seniorityOf(text, title),
        education: edu,
        certifications: extractCertifications(requirementText),
      },
      keywords: rankKeywords(text, 30),
      softSkills: TAX.findSoft(text),
      skillMentions: {
        langs: TAX.matchLangs(text),
        frameworks: TAX.matchFrameworks(text),
        tools: TAX.matchTools(text),
        ml: TAX.matchML(text),
        domain: TAX.matchDomain(text),
      },
    };
  };
})();
