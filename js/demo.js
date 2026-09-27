/* ============================================================
   JobProof AI — js/demo.js
   Demo mode: a deterministic sample candidate (Alex Kumar,
   AI/ML Engineer Intern) run through the REAL agent pipeline —
   the seeded evidence is structured through the same verifier,
   mission planner, and orchestrator as user data. Clearly
   labeled as demo data; "Delete everything" removes it.
   ============================================================ */

(function () {
  "use strict";

  var JP = window.JP;
  var store = JP.store;

  var DEMO_RESUME = [
    "Alex Kumar",
    "Bengaluru, India · alex.kumar@example.com · github.com/alexkumar-demo",
    "",
    "SUMMARY",
    "Computer science student focused on machine learning. Have built and trained models for two academic projects and one personal project; comfortable with Python and standard ML libraries.",
    "",
    "SKILLS",
    "Python, Machine Learning, TensorFlow, Deep Learning basics, SQL, Git, Pandas, NumPy, Matplotlib",
    "",
    "PROJECTS",
    "CropYield-ML — Crop yield prediction from weather and soil data",
    "Worked on cleaning and analyzing agricultural data with Pandas.",
    "Trained a gradient boosting model and a small neural network in TensorFlow to predict yield.",
    "Evaluated both models with RMSE and compared results in a report.",
    "",
    "CampusChat — sentiment analysis of college forum posts",
    "Built a text preprocessing pipeline and trained a logistic regression classifier.",
    "Achieved 0.81 F1 on the held-out test split.",
    "",
    "EDUCATION",
    "B.Tech Computer Science, 2023 - 2027 (expected)",
    "Relevant coursework: Data Structures, Probability, Machine Learning, Databases",
    "",
    "CERTIFICATIONS",
    "Machine Learning Fundamentals — online course certificate (2025)",
  ].join("\n");

  var DEMO_JD = [
    "AI/ML Engineer Intern",
    "",
    "We are looking for an AI/ML Engineer Intern to join our applied machine learning team.",
    "",
    "Responsibilities:",
    "- Build and train machine learning models on production data",
    "- Write clean, tested Python and collaborate through Git",
    "- Query and analyze data with SQL",
    "- Help evaluate models and document experiments",
    "",
    "Required skills:",
    "- Python",
    "- Machine learning fundamentals (supervised learning, evaluation metrics)",
    "- SQL",
    "- Deep learning basics (TensorFlow or PyTorch)",
    "- Git",
    "",
    "Preferred:",
    "- Experience deploying models as APIs",
    "- Docker",
    "- REST APIs",
    "- Familiarity with cloud platforms",
  ].join("\n");

  function seed() {
    var d = store.get();
    d.profile = { name: "Alex Kumar", githubUrl: "", linkedinUrl: "" };
    d.demo = true;
    d.resume = {
      name: "Alex Kumar",
      fileName: "demo-alex-kumar.txt",
      size: DEMO_RESUME.length,
      uploadedAt: new Date().toISOString(),
      text: DEMO_RESUME,
      structured: null,
    };
    try {
      d.resume.structured = JP.parseResume(DEMO_RESUME, { fileName: "demo-alex-kumar.txt", kind: "txt" });
    } catch (e) { d.resume.structured = null; }
    d.job = { mode: "details", title: "AI/ML Engineer Intern", company: "Demo Company", url: "", text: DEMO_JD };
    store.save();
  }

  function seedEvidence() {
    // Deterministic demo evidence, processed by the real verifier.
    // Source is labeled "Demo" everywhere it appears.
    JP.verifier.addEvidence({ skill: "Python", type: "project", source: "Demo: CropYield-ML project", description: "Data cleaning, feature preparation and model training written in Python.", strength: 1.6 });
    JP.verifier.addEvidence({ skill: "Machine Learning", type: "project", source: "Demo: CropYield-ML project", description: "Trained and compared two models with RMSE evaluation.", strength: 1.6 });
    JP.verifier.addEvidence({ skill: "TensorFlow", type: "project", source: "Demo: CropYield-ML project", description: "Small neural network built and trained in TensorFlow.", strength: 1.2 });
    JP.verifier.addEvidence({ skill: "Deep Learning", type: "certificate", source: "Demo: ML Fundamentals certificate", description: "Course certificate — learning evidence only.", strength: 0.6 });
    JP.verifier.addEvidence({ skill: "Git", type: "project", source: "Demo: CampusChat project", description: "Version-controlled project workflow.", strength: 1.0 });
    // SQL and deployment intentionally have NO evidence — they become
    // the demo's critical gaps and generate missions.
  }

  function isDemo() {
    return !!store.get().demo;
  }

  /* Live demo: seed, run the orchestrated assessment with animated
     step status, then open Career Readiness. */

  function runLiveDemo(onStep, onDone, onFail) {
    // Reset feature data so the demo starts clean but keep nothing hidden.
    var d = store.get();
    d.f2 = { skills: [], evidence: [], gaps: [], missions: [], interviews: [], history: [], reports: [] };
    d.f3 = { jobs: [], saved: [], applications: [], versions: [], changes: [] };
    d.analysis = null;
    d.activity = [];
    store.save();

    seed();

    // Run the REAL Feature 1 pipeline first (parse + match).
    JP.agents.log("Orchestrator", JP.agents.S.RUNNING, "Demo assessment started for Alex Kumar — AI/ML Engineer Intern.");
    JP.runAnalysis(DEMO_RESUME, d.resume, { mode: "details", title: "AI/ML Engineer Intern", company: "Demo Company", url: "", text: DEMO_JD }, function () {})
      .then(function (analysis) {
        var dd = store.get();
        dd.analysis = analysis;
        store.save();

        seedEvidence();

        // Orchestrated multi-agent run with per-step UI updates.
        return JP.agents.runAssessment({
          onStep: function (key, state, label, out) {
            if (onStep) onStep(key, state, label, out);
          },
        }).then(function (results) {
          var f2 = store.f2();
          JP.agents.log("Orchestrator", JP.agents.S.COMPLETED,
            "Demo complete — " + f2.skills.length + " skills assessed, " + f2.missions.length + " mission(s) generated.");
          if (onDone) onDone(results);
        });
      })
      .catch(function (e) {
        if (onFail) onFail((e && e.userMessage) || "Demo run failed.");
      });
  }

  /* ---------- Demo overlay UI ---------- */

  function ensureHomeButton() {
    var host = document.getElementById("home-note");
    if (!host || document.getElementById("demo-run-btn")) return;
    var btn = document.createElement("button");
    btn.className = "btn btn-ghost btn-sm";
    btn.id = "demo-run-btn";
    btn.type = "button";
    btn.textContent = "Run live demo (sample candidate)";
    btn.addEventListener("click", function () { openOverlay(); });
    host.parentNode.insertBefore(document.createElement("br"), host);
    host.parentNode.insertBefore(btn, host);
  }

  var AGENT_ROWS = [
    ["jobmarket", "Job Market Agent"],
    ["resume", "Resume Agent"],
    ["github", "GitHub Agent"],
    ["evidence", "Evidence Engine"],
    ["missions", "Mission Planner"],
  ];

  function openOverlay() {
    var layer = document.createElement("div");
    layer.className = "modal-overlay jp-layer";
    layer.id = "demo-overlay";
    var rows = AGENT_ROWS.map(function (r) {
      return '<div class="act-row" data-step="' + r[0] + '">' +
        '<span class="act-agent">' + r[1] + "</span>" +
        '<span class="act-state wait">WAITING</span>' +
        '<span class="act-text"></span></div>';
    }).join("");
    layer.innerHTML =
      '<div class="modal" role="dialog" aria-modal="true" aria-label="Live demo">' +
      "<h2>Live demo &mdash; Alex Kumar</h2>" +
      '<p class="modal-text">A sample candidate runs through the real pipeline: seeded demo evidence is verified by the same agents that assess your data. No external services.</p>' +
      '<div class="act-log" id="demo-log">' +
      '<div class="act-row" data-step="orchestrator"><span class="act-agent">Orchestrator</span><span class="act-state run">RUNNING</span><span class="act-text"></span></div>' +
      rows +
      "</div>" +
      '<div class="modal-actions"><button class="btn btn-ghost" id="demo-cancel" type="button">Cancel</button></div>' +
      "</div>";
    document.body.appendChild(layer);
    layer.querySelector("#demo-cancel").addEventListener("click", function () { layer.remove(); });

    function setRow(key, state, text) {
      var row = layer.querySelector('[data-step="' + key + '"]');
      if (!row) return;
      var pill = row.querySelector(".act-state");
      pill.className = "act-state " + (state === "COMPLETED" ? "ok" : state === "RUNNING" ? "run" : state === "FAILED" ? "fail" : "wait");
      pill.textContent = state;
      if (text) row.querySelector(".act-text").textContent = text;
    }

    runLiveDemo(
      function (key, state, label, out) {
        setRow(key, state, out && out.message ? out.message : "");
      },
      function () {
        setRow("orchestrator", "COMPLETED", "Readiness updated.");
        setTimeout(function () {
          layer.remove();
          JP.demo.reset();
          JP.app.showView("career");
          JP.ui.toast("Demo complete \u2014 every number below is computed from the demo evidence.");
        }, 900);
      },
      function (msg) {
        setRow("orchestrator", "FAILED", msg);
      }
    );
  }

  function init() {
    ensureHomeButton();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  JP.demo = {
    runLiveDemo: runLiveDemo,
    isDemo: isDemo,
    openOverlay: openOverlay,
    reset: function () {
      var d = store.get();
      d.demo = false;
      store.save();
    },
  };
})();
