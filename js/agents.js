/* ============================================================
   JobProof AI — js/agents.js
   The agentic core. An Orchestrator runs specialized agents as
   real state machines: each agent records its state, inputs,
   outputs, and duration in the activity log. The UI animates
   what actually happened — nothing is staged.
   ============================================================ */

(function () {
  "use strict";

  var JP = window.JP;
  var U = JP.util;
  var store = JP.store;

  /* ================= Agent states ================= */

  var S = {
    IDLE: "IDLE",
    RUNNING: "RUNNING",
    WAITING: "WAITING",
    COMPLETED: "COMPLETED",
    FAILED: "FAILED",
    NEEDS_INPUT: "NEEDS_INPUT",
  };

  /* ================= Activity log ================= */
  /* Persisted in store.activity: { id, ts, agent, state, text } */

  function log(agent, state, text) {
    var entry = {
      id: store.uid("run"),
      ts: new Date().toISOString(),
      agent: agent,
      state: state,
      text: text,
    };
    var d = store.get();
    d.activity.unshift(entry);
    if (d.activity.length > 120) d.activity.length = 120;
    store.save();
    JP.emitActivity && JP.emitActivity(entry);
    return entry;
  }

  /* ================= Agent primitive ================= */

  function makeAgent(name, fn) {
    return {
      name: name,
      state: S.IDLE,
      run: function (ctx) {
        var self = this;
        self.state = S.RUNNING;
        return new Promise(function (resolve) {
          setTimeout(function () {
            var t0 = Date.now();
            var out;
            try {
              out = fn(ctx) || {};
              self.state = out.needsInput ? S.NEEDS_INPUT : S.COMPLETED;
            } catch (err) {
              out = { error: true, message: (err && err.message) || "Agent failed" };
              self.state = S.FAILED;
            }
            out.ms = Date.now() - t0;
            resolve(out);
          }, 40);
        });
      },
    };
  }

  /* ================= Job Market Agent ================= */
  /* Reuses Feature 1's JD parser — the source of truth for what a
     role requires. With a pasted description it parses the real
     text; with title-only input it says so instead of inventing. */

  var jobMarketAgent = makeAgent("Job Market Agent", function (ctx) {
    var jd = ctx.jd || null;
    if (jd) {
      var reqs = jd.requirements.skills || [];
      var prefs = jd.requirements.preferred || [];
      log("Job Market Agent", S.COMPLETED,
        "Parsed " + (jd.title ? "\u201C" + jd.title + "\u201D" : "role") + " — " +
        reqs.length + " required, " + prefs.length + " preferred skills identified.");
      return { title: jd.title, company: jd.company, requirements: reqs, preferred: prefs, source: "Job description" };
    }
    log("Job Market Agent", S.NEEDS_INPUT,
      "No job description available. Paste one to identify real requirements.");
    return { needsInput: true, message: "No job description to analyze yet." };
  });

  /* ================= Resume Agent ================= */
  /* Reuses Feature 1's resume parser, then converts claims into
     verification candidates — not a summary. */

  var resumeAgent = makeAgent("Resume Agent", function (ctx) {
    var resume = ctx.resume;
    if (!resume || !resume.text || resume.text.length < 60) {
      log("Resume Agent", S.NEEDS_INPUT, "No readable resume on file.");
      return { needsInput: true, message: "No readable resume on file." };
    }
    var skills = (resume.structured && resume.structured.skills) || [];
    var bullets = (resume.structured && resume.structured.bullets) || [];
    var projects = (resume.structured && resume.structured.projects) || [];
    var claims = skills.map(function (s) {
      return {
        skill: s.label || String(s),
        source: "Resume",
        needsVerification: ["tooling", "usage", "implementation"],
      };
    });
    log("Resume Agent", S.COMPLETED,
      claims.length + " skill claims and " + bullets.length + " evidence bullets extracted" +
      (projects.length ? " across " + projects.length + " project(s)." : "."));
    return { claims: claims, bullets: bullets, projects: projects };
  });

  /* ================= GitHub / Project Agent ================= */
  /* Attempts real, CORS-safe access to public repository metadata.
     Accessible  -> verifies the languages/files it can actually see.
     Inaccessible -> NEEDS_INPUT with a clear message. Never invents. */

  var githubAgent = makeAgent("GitHub Agent", function (ctx) {
    var url = (ctx.profile && ctx.profile.githubUrl) || "";
    return JP.github.fetchProfile(url).then(function (res) {
      if (res.ok) {
        var langs = {};
        res.repos.forEach(function (r) {
          (r.languages || []).forEach(function (l) { langs[l] = (langs[l] || 0) + 1; });
        });
        var top = Object.keys(langs).sort(function (a, b) { return langs[b] - langs[a]; }).slice(0, 6);
        log("GitHub Agent", S.COMPLETED,
          "Analyzed " + res.repos.length + " public repositories. Languages found: " +
          (top.join(", ") || "none") + ".");
        return { ok: true, repos: res.repos, languages: top };
      }
      log("GitHub Agent", res.network ? S.NEEDS_INPUT : S.NEEDS_INPUT,
        res.message || "Repository data unavailable.");
      return { ok: false, message: res.message, network: !!res.network };
    });
  });

  /* ================= Evidence / Verification Engine ================= */
  /* Combines claims (resume), practical evidence (github, projects,
     missions, interviews) into a per-skill status. Three primary
     states + one honest fallback. Uses the shared verifier. */

  var evidenceAgent = makeAgent("Evidence Engine", function (ctx) {
    var out = JP.verifier.computeAll(ctx);
    var verified = out.skills.filter(function (s) { return s.status === "VERIFIED"; }).length;
    var partial = out.skills.filter(function (s) { return s.status === "PARTIAL"; }).length;
    log("Evidence Engine", S.COMPLETED,
      out.skills.length + " skills assessed: " + verified + " verified, " + partial + " partial, " +
      (out.skills.length - verified - partial) + " not established. " +
      out.gaps.length + " gap(s) identified.");
    return out;
  });

  /* ================= Mission Planner ================= */

  var missionAgent = makeAgent("Mission Planner", function (ctx) {
    var created = JP.missions.syncFromGaps(ctx.gaps || []);
    var open = created.filter(function (m) { return m.status === "Not Started" || m.status === "In Progress"; });
    log("Mission Planner", S.COMPLETED,
      created.length + " mission(s) on file" + (open.length ? ", " + open.length + " active." : "."));
    return { missions: created };
  });

  /* ================= Orchestrator ================= */

  var ORCH_STEPS = [
    { key: "jobmarket", label: "Job Market Agent", agent: function () { return jobMarketAgent; } },
    { key: "resume", label: "Resume Agent", agent: function () { return resumeAgent; } },
    { key: "github", label: "GitHub Agent", agent: function () { return githubAgent; } },
    { key: "evidence", label: "Evidence Engine", agent: function () { return evidenceAgent; } },
    { key: "missions", label: "Mission Planner", agent: function () { return missionAgent; } },
  ];

  function resetAgents() {
    ORCH_STEPS.forEach(function (s) { s.agent().state = S.IDLE; });
  }

  function runAssessment(opts) {
    opts = opts || {};
    var onStep = opts.onStep || function () {};
    var d = store.get();

    var ctx = {
      resume: d.resume,
      jd: null,
      analysis: d.analysis,
      profile: store.profile(),
      f2: store.f2(),
    };
    // Parse the stored job description on demand (pure, local).
    if (d.job && d.job.text && d.job.text.trim().length >= 80) {
      try {
        ctx.jd = JP.parseJobDescription(d.job.text, {
          title: d.job.title, company: d.job.company, url: d.job.url, mode: d.job.mode || "text",
        });
      } catch (e) { ctx.jd = null; }
    }

    resetAgents();
    log("Orchestrator", S.RUNNING, "Assessment started.");

    var results = {};
    var chain = Promise.resolve();

    ORCH_STEPS.forEach(function (step) {
      chain = chain.then(function () {
        onStep(step.key, S.RUNNING, step.label);
        var agen = step.agent();
        return agen.run(ctx).then(function (out) {
          results[step.key] = out;
          ctx.evidence = results.evidence; // once Evidence Engine has run
          if (step.key === "evidence") {
            // Mission planner runs on the fresh gaps.
            ctx.gaps = out.gaps;
          }
          onStep(step.key, agen.state, step.label, out);
        });
      });
    });

    return chain.then(function () {
      log("Orchestrator", S.COMPLETED, "Assessment complete. Readiness updated.");
      return results;
    }).catch(function (err) {
      log("Orchestrator", S.FAILED, "Assessment failed: " + ((err && err.message) || "unknown error"));
      throw err;
    });
  }

  /* ================= Readiness (evidence-based, not a prediction) ================= */

  function readinessState() {
    var f2 = store.f2();
    var d = store.get();
    var relevantSkills = f2.skills.filter(function (s) { return s.forRole; });
    if (!relevantSkills.length) return "Insufficient Evidence";
    var verified = relevantSkills.filter(function (s) { return s.status === "VERIFIED"; }).length;
    var partial = relevantSkills.filter(function (s) { return s.status === "PARTIAL"; }).length;
    var missing = relevantSkills.filter(function (s) { return s.status === "NOT VERIFIED"; }).length;
    if (missing === 0 && verified >= Math.max(1, Math.floor(relevantSkills.length * 0.6))) return "Ready";
    if (missing <= 1 && partial + verified >= relevantSkills.length - 1) return "Nearly Ready";
    if (verified + partial > 0) return "Needs Work";
    return "Insufficient Evidence";
  }

  /* ================= Next action (decision priority) ================= */

  function nextAction() {
    var d = store.get();
    var f2 = store.f2();
    var f3 = store.f3();

    // 1. Critical job requirement gaps with an active mission.
    var activeMission = f2.missions.find(function (m) { return m.status === "In Progress"; });
    if (activeMission) {
      return { kind: "mission", title: "Continue \u201C" + activeMission.title + "\u201D", why: activeMission.why, missionId: activeMission.id };
    }
    var openMission = f2.missions.find(function (m) { return m.status === "Not Started"; });
    if (openMission) {
      return { kind: "mission", title: "Start \u201C" + openMission.title + "\u201D", why: openMission.why, missionId: openMission.id };
    }

    // 2. Missing evidence for claimed skills.
    var claimNoProof = f2.skills.find(function (s) { return s.claimed && s.status === "NOT VERIFIED"; });
    if (claimNoProof) {
      return { kind: "evidence", title: "Prove \u201C" + claimNoProof.name + "\u201D", why: "You claim it on your resume, but no evidence supports it yet." };
    }

    // 3. Ready-to-apply jobs not yet applied.
    var readyApp = f3.applications.find(function (a) { return a.status === "Ready to Apply"; });
    if (readyApp) {
      return { kind: "apply", title: "Apply to \u201C" + (readyApp.role || "saved job") + "\u201D", why: "The application is prepared and reviewed." };
    }

    // 4. Interview validation of verified/partial skills.
    var needsInterview = f2.skills.find(function (s) { return s.status === "PARTIAL"; });
    if (needsInterview) {
      return { kind: "interview", title: "Validate \u201C" + needsInterview.name + "\u201D in an interview", why: "Partial evidence — an interview can raise (or correct) it." };
    }

    // 5. Run an analysis.
    if (!d.analysis) {
      return { kind: "analyze", title: "Run your first job analysis", why: "JobProof needs a resume and a target job to say anything useful." };
    }
    return { kind: "analyze", title: "Re-run your analysis", why: "Your resume or job changed since the last analysis." };
  }

  JP.agents = {
    S: S,
    log: log,
    runAssessment: runAssessment,
    readinessState: readinessState,
    nextAction: nextAction,
    steps: ORCH_STEPS,
    resetStates: resetAgents,
  };
})();
