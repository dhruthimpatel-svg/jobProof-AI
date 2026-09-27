/* ============================================================
   JobProof AI — js/pipeline.js
   Orchestrates the whole analysis, step by step, with progress
   reporting. Every stage is a separate function so Features 2–4
   can reuse them or add their own stages later.
   ============================================================ */

(function () {
  "use strict";

  var JP = window.JP;

  var STAGES = [
    { key: "resume", label: "Reading your resume" },
    { key: "job", label: "Parsing the job description" },
    { key: "match", label: "Scoring role match" },
    { key: "ats", label: "Running ATS checks" },
    { key: "keywords", label: "Comparing keywords" },
    { key: "insights", label: "Reviewing as a hiring manager" },
    { key: "rewrite", label: "Finding what to fix first" },
  ];

  /* Run the full analysis. Reports progress via onStage(stage, i).
     Returns a single result object consumed by the UI.
     Backend-first: when the server is reachable, the pipeline runs
     there (same engine, ported to Python) and stages are reported
     between request start/finish. Otherwise the identical in-browser
     engine below runs — same thresholds, same outputs. */
  JP.runAnalysis = function (resumeText, resumeMeta, jobInput, onStage) {
    function stage(i) {
      if (typeof onStage === "function") onStage(STAGES[i], i, STAGES.length);
    }

    if (window.JP && JP.api && JP.api.isOnline && JP.api.isOnline()) {
      return new Promise(function (resolve, reject) {
        var i = 0;
        stage(0);
        var ticker = setInterval(function () {
          i = Math.min(i + 1, STAGES.length - 1);
          stage(i);
        }, 350);
        JP.api.analyze({ resumeText: resumeText, resumeMeta: resumeMeta || {}, job: jobInput })
          .then(function (res) {
            clearInterval(ticker);
            stage(STAGES.length - 1);
            if (res.analysis && res.analysis.match) resolve(res.analysis);
            else reject({ userMessage: "The server returned an unusable analysis." });
          })
          .catch(function (err) {
            clearInterval(ticker);
            if (err && err.status && err.status === 422) { reject(err); return; } // honest JD-too-short error
            runLocal(resolve, reject); // server hiccup → local engine
          });
      });
    }

    return runLocalPromise();

    function runLocalPromise() {
      return new Promise(function (resolve, reject) { runLocal(resolve, reject); });
    }

    function runLocal(resolve, reject) {
      // Give the UI one frame to paint the first stage label.
      setTimeout(function () {
        try {
          /* ---- Stage 1: resume ---- */
          stage(0);
          var resume = JP.parseResume(resumeText, resumeMeta || {});
          if (!resume || resume.meta.wordCount < 60) {
            reject({
              userMessage: "This resume doesn't contain enough readable text to analyze. Please upload a resume with your actual content.",
            });
            return;
          }

          /* ---- Stage 2: job description ---- */
          stage(1);
          var jdText, jdDetails;
          if (jobInput.mode === "details") {
            if (!jobInput.text || jobInput.text.trim().length < 80) {
              reject({
                userMessage: "We couldn't access this job posting directly. Paste the job description to continue.",
              });
              return;
            }
            jdText = jobInput.text;
            jdDetails = { title: jobInput.title, company: jobInput.company, url: jobInput.url, mode: "details" };
          } else {
            jdText = jobInput.text;
            jdDetails = { mode: "text" };
          }
          if (!jdText || jdText.trim().length < 80) {
            reject({
              userMessage: "The job description is too short to analyze. Paste the full posting (at least a few sentences).",
            });
            return;
          }
          var jd = JP.parseJobDescription(jdText, jdDetails);

          /* ---- Stage 3: match ---- */
          stage(2);
          var match = JP.computeMatch(resume, jd);
          JP._lastEvidence = match.evidence; // used by the rewriter

          /* ---- Stage 4: ATS ---- */
          stage(3);
          var ats = JP.computeATS(resume, jd, match);

          /* ---- Stage 5: keywords ---- */
          stage(4);
          var keywords = JP.computeKeywords(resume, jd, match);

          /* ---- Stage 6: insights ---- */
          stage(5);
          var insights = JP.computeInsights(resume, jd, match);
          var benchmark = JP.computeBenchmark(resume, jd, match);
          var honest = JP.computeHonest(resume, jd, match, keywords);
          var priorities = JP.computePriorities(resume, jd, match, keywords);

          /* ---- Stage 7: rewrites ---- */
          stage(6);
          var rewrites = JP.buildRewrites(resume, jd);
          var summaryRewrite = JP.rewriteSummary(resume, jd, match);

          /* ---- Final summary (last stage) ---- */
          stage(6);
          var final = JP.computeFinal(match, priorities);

          var result = {
            match: match,
            ats: ats,
            keywords: keywords,
            insights: insights,
            benchmark: benchmark,
            honest: honest,
            priorities: priorities,
            rewrites: rewrites,
            summaryRewrite: summaryRewrite,
            final: final,
            generatedAt: new Date().toISOString(),
          };

          resolve(result);
        } catch (err) {
          reject({
            userMessage: "Something went wrong during the analysis. Please try again.",
            error: err,
          });
        }
      }, 30);
    }
  };

  JP.ANALYSIS_STAGES = STAGES;
})();
