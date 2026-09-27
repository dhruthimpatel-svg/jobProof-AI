/* ============================================================
   JobProof AI — js/missions.js
   Mission Agent: turns verified gaps into concrete missions
   (LEARN / BUILD / IMPROVE / PROVE / PRACTICE / APPLY). Missions
   are generated from the user's actual gaps — never from a
   generic library of busywork.
   ============================================================ */

(function () {
  "use strict";

  var JP = window.JP;
  var store = JP.store;

  var MISSION_TYPES = ["LEARN", "BUILD", "IMPROVE", "PROVE", "PRACTICE", "APPLY"];
  var STATUSES = ["Not Started", "In Progress", "Submitted", "Evidence Added", "Verified", "Needs Improvement"];

  /* ---------- Templates per gap kind ---------- */

  function buildMissionForGap(gap) {
    var skill = gap.title;
    var type = "PROVE";
    if (gap.resumeFix) {
      type = "IMPROVE";
    } else if (gap.status === "INSUFFICIENT EVIDENCE" || gap.status === "NOT VERIFIED") {
      type = "BUILD";
    } else if (gap.status === "PARTIAL") {
      type = "PROVE";
    }

    var m = {
      id: store.uid("mis"),
      gapId: gap.id,
      skill: skill,
      type: type,
      title: "",
      why: gap.why,
      expectedOutcome: "",
      steps: [],
      evidenceRequirements: [],
      estimatedEffort: "",
      status: "Not Started",
      createdAt: new Date().toISOString(),
      completedAt: null,
      progress: 0,
    };

    if (type === "IMPROVE") {
      m.title = "Rewrite your bullets around outcomes";
      m.expectedOutcome = "Resume bullets state what you did and what measurably changed.";
      m.steps = [
        "Open Job Match \u2192 Rewrites",
        "Accept the honest rewrites that match what you actually did",
        "Edit any rewrite to add real numbers you left out",
        "Keep the originals for anything you can't back up",
      ];
      m.evidenceRequirements = ["Updated resume bullets (accepted rewrites)"];
      m.estimatedEffort = "30\u201360 min";
      m.resumeFix = true;
    } else if (type === "BUILD") {
      m.title = "Build a small " + skill + " project";
      m.expectedOutcome = "A working project that demonstrates " + skill + " in use, published somewhere inspectable.";
      m.steps = [
        "Pick a problem you genuinely want to solve with " + skill,
        "Scope it small enough to finish in days, not months",
        "Build it and keep the code organized",
        "Write a README: what it does, how to run it, what you'd improve",
        "Publish it (GitHub or a public link)",
        "Add it as evidence here",
        "Complete a verification interview on " + skill,
      ];
      m.evidenceRequirements = ["GitHub repository or project URL", "README or short explanation"];
      m.estimatedEffort = "2\u20134 evenings";
    } else if (type === "PROVE") {
      m.title = "Collect stronger evidence for " + skill;
      m.expectedOutcome = "Existing evidence upgraded from partial to verifiable.";
      m.steps = [
        "List where you've actually used " + skill,
        "Make the strongest one inspectable (public repo, deployed demo, doc)",
        "Write a short explanation of your specific contribution",
        "Add it as evidence",
        "Complete a verification interview on " + skill,
      ];
      m.evidenceRequirements = ["Project link or repository", "Short written explanation"];
      m.estimatedEffort = "1\u20132 hours";
    }

    return m;
  }

  /* Sync: create missions for gaps that don't have one; retire
     missions for gaps that no longer exist (skill verified). */

  function syncFromGaps(gaps) {
    var f2 = store.f2();
    gaps.forEach(function (gap) {
      var existing = f2.missions.find(function (m) {
        return m.gapId === gap.id && m.status !== "Verified";
      });
      if (!existing && gap.severity !== "low") {
        f2.missions.unshift(buildMissionForGap(gap));
      }
    });
    // Missions whose gap disappeared (skill verified) get marked done.
    f2.missions.forEach(function (m) {
      if (m.status !== "Verified" && m.status !== "Not Started" && m.status !== "In Progress") return;
      var gapStillExists = gaps.some(function (g) { return g.id === m.gapId; });
      if (!gapStillExists && m.status !== "Verified") {
        m.status = "Verified";
        m.completedAt = new Date().toISOString();
        m.progress = 100;
      }
    });
    store.save();
    return f2.missions;
  }

  function setStatus(missionId, status) {
    var f2 = store.f2();
    var m = f2.missions.find(function (x) { return x.id === missionId; });
    if (!m) return null;
    m.status = status;
    if (status === "Verified") { m.completedAt = new Date().toISOString(); m.progress = 100; }
    else if (status === "In Progress") m.progress = Math.max(m.progress, 20);
    else if (status === "Evidence Added") m.progress = Math.max(m.progress, 80);
    store.save();
    JP.agents.log("Mission Planner", JP.agents.S.COMPLETED,
      "Mission \u201C" + m.title + "\u201D \u2192 " + status + ".");
    return m;
  }

  function progressStep(missionId) {
    var f2 = store.f2();
    var m = f2.missions.find(function (x) { return x.id === missionId; });
    if (!m) return null;
    m.progress = Math.min(100, (m.progress || 0) + Math.round(100 / Math.max(1, m.steps.length)));
    if (m.progress >= 100 && m.status === "Not Started") m.status = "In Progress";
    store.save();
    return m;
  }

  JP.missions = {
    TYPES: MISSION_TYPES,
    STATUSES: STATUSES,
    syncFromGaps: syncFromGaps,
    setStatus: setStatus,
    progressStep: progressStep,
  };
})();
