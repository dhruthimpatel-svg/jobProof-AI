/* ============================================================
   JobProof AI — js/interview.js
   Adaptive Interview Agent. Questions are generated from the
   user's real profile: target role requirements, claimed skills,
   their actual projects and resume bullets. Difficulty adapts to
   each answer. Results become interview evidence in the proof
   system — labeled "JobProof interview assessment", never a
   hiring prediction.
   ============================================================ */

(function () {
  "use strict";

  var JP = window.JP;
  var U = JP.util;
  var store = JP.store;

  var MAX_QUESTIONS = 7;

  /* ================= Question generation ================= */
  /* Built from the ledger of skills + the user's real projects.
     Every question references the user's own claims or work. */

  function pickTargetSkills() {
    var f2 = store.f2();
    // Prioritize role-required skills that are claimed or partial —
    // that's where an interview changes the verdict.
    var pool = f2.skills.filter(function (s) {
      return s.required || s.claimed;
    });
    var rank = { PARTIAL: 0, "NOT VERIFIED": 1, "INSUFFICIENT EVIDENCE": 2, VERIFIED: 3 };
    pool.sort(function (a, b) {
      var ra = rank[a.status] != null ? rank[a.status] : 9;
      var rb = rank[b.status] != null ? rank[b.status] : 9;
      if (ra !== rb) return ra - rb;
      return (b.required ? 1 : 0) - (a.required ? 1 : 0);
    });
    return pool.slice(0, 5).map(function (s) { return s.name; });
  }

  function questionFor(skill, difficulty, project) {
    var s = skill;
    switch (difficulty) {
      case 1: return {
        text: "What does " + s + " look like in practice? Describe it as if to a teammate who hasn't used it.",
        concept: s + " fundamentals",
      };
      case 2: return {
        text: project
          ? "In \u201C" + project.name + "\u201D, where exactly did " + s + " come in? What did you personally do?"
          : "Describe one specific task you completed using " + s + " — what did you build or do, step by step?",
        concept: s + " applied use",
      };
      case 3: return {
        text: project
          ? "Walk me through how " + s + " worked inside \u201C" + project.name + "\u201D. What choices did you make, and why those?"
          : "A teammate says your approach with " + s + " should have been different. How do you decide whose way is better?",
        concept: s + " reasoning",
      };
      case 4: return {
        text: "Tell me about something that went wrong while you were working with " + s + ". How did you find the cause and what fixed it?",
        concept: s + " debugging",
      };
      default: return {
        text: "You have one week to get a new teammate productive with " + s + " on " + (project ? "\u201C" + project.name + "\u201D" : "a project like yours") + ". What do you teach first, what do you skip, and why?",
        concept: s + " depth",
      };
    }
  }

  /* ================= Answer evaluation ================= */
  /* Transparent heuristics — the UI explains what was measured.
     No pretend-LLM scoring. */

  var HEDGES = /\b(i guess|i think maybe|not really sure|no idea|kind of|sort of|something like that|whatever)\b/;
  var STRUCTURE = /\b(first|then|after that|because|so that|the reason|step|finally|which means)\b/;
  var NUMBERS = /\b\d+\b/;

  function evaluate(answer, skill, difficulty) {
    var text = U.norm(String(answer || "")).trim();
    var words = text.split(/\s+/).filter(Boolean);
    var out = { coverage: 0, accuracy: 0, clarity: 0, score: 0, notes: [] };

    if (words.length < 6) {
      out.notes.push("Too short to demonstrate understanding.");
      out.clarity = 10;
      out.coverage = 5;
      out.accuracy = 5;
      out.score = 8;
      return out;
    }

    // Coverage: does it engage the specific skill concretely?
    var mentions = words.filter(function (w) { return w.indexOf(skill.toLowerCase().split(/\s+/)[0]) === 0; }).length;
    var techMentions = /\b(built|wrote|used|configured|deployed|designed|query|schema|model|function|api|database|server|client|component|endpoint|pipeline|test|bug|error|deploy|train|data|framework|library)\b/.test(text);
    out.coverage = techMentions ? 70 : 40;
    if (mentions >= 1) out.coverage += 10;
    if (words.length > 45) out.coverage += 10;

    // Accuracy proxy: structure and specificity (honest labeling: this
    // measures articulation, not ground truth).
    out.accuracy = 45;
    if (STRUCTURE.test(text)) { out.accuracy += 20; out.notes.push("Explained a process, not just a definition."); }
    if (NUMBERS.test(text)) { out.accuracy += 10; }
    if (HEDGES.test(text)) { out.accuracy -= 15; out.notes.push("Hedging language — sounded unsure of the specifics."); }

    // Clarity: sentence length sanity and word count.
    var sentences = text.split(/[.!?]+/).filter(function (s) { return s.trim().length > 2; });
    var avgLen = sentences.length ? words.length / sentences.length : words.length;
    out.clarity = avgLen > 45 ? 45 : avgLen < 4 ? 55 : 80;
    if (words.length >= 25 && words.length <= 160) out.clarity += 10;
    else if (words.length > 220) { out.clarity -= 15; out.notes.push("Very long — a reviewer would lose the thread."); }

    out.coverage = U.clamp(out.coverage, 0, 100);
    out.accuracy = U.clamp(out.accuracy, 0, 100);
    out.clarity = U.clamp(out.clarity, 0, 100);
    out.score = Math.round(out.coverage * 0.45 + out.accuracy * 0.4 + out.clarity * 0.15);
    if (!out.notes.length) out.notes.push("Clear, concrete answer.");
    return out;
  }

  /* ================= Interview lifecycle ================= */

  function start() {
    var f2 = store.f2();
    var skills = pickTargetSkills();
    var interview = {
      id: store.uid("int"),
      targetRole: currentRoleLabel(),
      status: "in-progress",
      startedAt: new Date().toISOString(),
      completedAt: null,
      questionIndex: 0,
      items: [],
      plannedSkills: skills,
    };
    f2.interviews.unshift(interview);
    if (f2.interviews.length > 12) f2.interviews.length = 12;
    nextQuestion(interview); /* seed question 1 */
    store.save();
    JP.agents.log("Interview Agent", JP.agents.S.RUNNING,
      "Interview started. Focus skills: " + (skills.join(", ") || "none identified yet") + ".");
    return interview;
  }

  function currentRoleLabel() {
    var d = store.get();
    if (d.job && d.job.title) return d.job.title;
    if (d.analysis && d.analysis.match && d.analysis.match.role && d.analysis.match.role.label) return d.analysis.match.role.label;
    return "Target role";
  }

  function nextQuestion(interview) {
    if (!interview || interview.status !== "in-progress") return null;
    if (interview.items.length >= MAX_QUESTIONS) return null;
    var f2 = store.f2();
    var idx = interview.items.length;
    // Cycle through planned skills; difficulty tracked per skill.
    var skill = interview.plannedSkills[idx % Math.max(1, interview.plannedSkills.length)] || null;
    if (!skill) return null;
    var diff = interview.difficultyBySkill && interview.difficultyBySkill[skill] || 2;
    var project = userProjectFor(skill);
    var q = questionFor(skill, diff, project);
    var item = {
      id: store.uid("q"),
      question: q.text,
      concept: q.concept,
      skill: skill,
      difficulty: diff,
      answer: "",
      evaluation: null,
    };
    interview.items.push(item);
    store.save();
    return item;
  }

  function userProjectFor(skill) {
    var d = store.get();
    var projects = d.resume && d.resume.structured ? d.resume.structured.projects || [] : [];
    var key = U.norm(skill);
    return projects.find(function (p) {
      var blob = U.norm([p.name, (p.technologies || []).join(" "), (p.bullets || []).join(" ")].join(" "));
      return blob.indexOf(key) !== -1 || (p.technologies || []).some(function (t) { return U.norm(t) === key; });
    }) || projects[0] || null;
  }

  function submitAnswer(interview, itemId, answer) {
    var item = interview.items.find(function (x) { return x.id === itemId; });
    if (!item) return null;
    item.answer = String(answer || "").trim();
    item.evaluation = evaluate(item.answer, item.skill, item.difficulty);

    // Adapt: strong answer → harder, weak → one step gentler.
    interview.difficultyBySkill = interview.difficultyBySkill || {};
    var cur = interview.difficultyBySkill[item.skill] || 2;
    if (item.evaluation.score >= 72) interview.difficultyBySkill[item.skill] = Math.min(5, cur + 1);
    else if (item.evaluation.score < 40) interview.difficultyBySkill[item.skill] = Math.max(1, cur - 1);
    nextQuestion(interview); /* generate the next question */
    store.save();
    return item;
  }

  /* Finish: aggregate per skill, write interview evidence, refresh
     the whole ledger through the verifier (which records history). */

  function complete(interview) {
    if (interview.status !== "in-progress") return interview;
    interview.status = "completed";
    interview.completedAt = new Date().toISOString();

    var bySkill = {};
    interview.items.forEach(function (it) {
      if (!it.evaluation) return;
      var k = U.norm(it.skill);
      if (!bySkill[k]) bySkill[k] = { skill: it.skill, scores: [], maxDiff: 0, notes: [] };
      bySkill[k].scores.push(it.evaluation.score);
      bySkill[k].maxDiff = Math.max(bySkill[k].maxDiff, it.difficulty);
      it.evaluation.notes.forEach(function (n) { bySkill[k].notes.push(n); });
    });

    var assessments = Object.keys(bySkill).map(function (k) {
      var b = bySkill[k];
      var avg = b.scores.reduce(function (a, x) { return a + x; }, 0) / b.scores.length;
      var status = avg >= 70 ? "VERIFIED" : avg >= 50 ? "PARTIAL" : "NOT VERIFIED";
      var limitation = null;
      if (status === "NOT VERIFIED") limitation = "Answers didn't yet demonstrate working command of " + b.skill + ".";
      if (status === "PARTIAL") limitation = "Solid fundamentals in " + b.skill + ", but the answers didn't establish deeper proficiency.";
      return { skill: b.skill, avg: Math.round(avg), status: status, questions: b.scores.length, limitation: limitation };
    });

    interview.result = {
      label: "JobProof interview assessment",
      assessments: assessments,
      overall: assessments.length ? Math.round(assessments.reduce(function (a, x) { return a + x.avg; }, 0) / assessments.length) : 0,
    };

    // Feed the proof system: one interview evidence item per assessed skill.
    // Strength reflects the actual assessment — the verifier treats a
    // strong interview as real validation, a weak one as little evidence.
    assessments.forEach(function (a) {
      JP.verifier.addEvidence({
        skill: a.skill,
        type: "interview",
        source: "JobProof interview",
        description: "Adaptive interview (" + a.questions + " question" + (a.questions === 1 ? "" : "s") + ") — assessed " + a.status.toLowerCase() + " at " + a.avg + "/100.",
        url: "",
        strength: a.avg >= 70 ? 1.8 : a.avg >= 50 ? 1.2 : 0.5,
        assessment: a.status,
      });
    });

    store.save();
    JP.agents.log("Interview Agent", JP.agents.S.COMPLETED,
      "Interview completed — " + assessments.length + " skill(s) assessed. Evidence updated.");
    return interview;
  }

  function latest() {
    var f2 = store.f2();
    return f2.interviews.find(function (i) { return i.status === "in-progress"; }) || f2.interviews[0] || null;
  }

  JP.interview = {
    MAX_QUESTIONS: MAX_QUESTIONS,
    start: start,
    nextQuestion: nextQuestion,
    submitAnswer: submitAnswer,
    complete: complete,
    latest: latest,
    evaluate: evaluate,
  };
})();
