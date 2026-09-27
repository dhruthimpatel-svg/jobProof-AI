/* ============================================================
   JobProof AI — js/modals.js
   Modal flows for Features 2–4: complete a mission (with the
   accomplishment/evidence/learned/changed form and the AI review
   that follows), and add evidence for a skill. Self-contained
   overlays appended to <body>; Escape and scrim close them.
   ============================================================ */

(function () {
  "use strict";

  var JP = window.JP;
  var U = JP.util;
  var esc = U.escapeHtml;

  var openLayer = null;

  function close() {
    if (openLayer && openLayer.parentNode) openLayer.parentNode.removeChild(openLayer);
    openLayer = null;
    document.removeEventListener("keydown", onKey);
  }

  function onKey(e) {
    if (e.key === "Escape") close();
  }

  function shell(title, bodyHtml, footHtml) {
    close();
    var layer = document.createElement("div");
    layer.className = "modal-overlay jp-layer";
    layer.innerHTML =
      '<div class="modal" role="dialog" aria-modal="true" aria-label="' + esc(title) + '">' +
      '<button class="modal-close" type="button" aria-label="Close">&times;</button>' +
      "<h2>" + esc(title) + "</h2>" +
      bodyHtml +
      '<div class="modal-actions">' + (footHtml || "") + "</div>" +
      "</div>";
    document.body.appendChild(layer);
    openLayer = layer;
    layer.addEventListener("mousedown", function (e) {
      if (e.target === layer) close();
    });
    layer.querySelector(".modal-close").addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    return layer;
  }

  var EV_TYPES = [
    ["github", "GitHub repository"],
    ["project", "Project URL"],
    ["portfolio", "Portfolio"],
    ["certificate", "Certificate (learning evidence)"],
    ["document", "Document"],
    ["interview", "JobProof interview"],
    ["other", "Other"],
  ];

  /* ---------- Add evidence ---------- */

  function openEvidence(skill, cb) {
    var options = EV_TYPES.map(function (t) {
      return '<option value="' + t[0] + '">' + esc(t[1]) + "</option>";
    }).join("");
    var skills = skill ? [skill] : recentSkills();
    var skillOpts = skills.map(function (s) {
      return '<option value="' + esc(s) + '">' + esc(s) + "</option>";
    }).join("");
    var layer = shell(
      "Add evidence",
      '<p class="modal-text">Evidence is what turns a claim into a verified skill. Course certificates count as learning evidence — not practical proof.</p>' +
      (skills.length
        ? '<label class="fld"><span>Skill</span><select id="ev-skill">' + skillOpts + "</select></label>"
        : '<label class="fld"><span>Skill</span><input id="ev-skill" type="text" placeholder="e.g. SQL" /></label>') +
      '<label class="fld"><span>Type</span><select id="ev-type">' + options + "</select></label>" +
      '<label class="fld"><span>Link (GitHub, project, portfolio)</span><input id="ev-url" type="url" placeholder="https://\u2026" /></label>' +
      '<label class="fld"><span>What is it? / what does it show?</span><textarea id="ev-desc" rows="3" placeholder="Describe your actual contribution \u2014 what you built and how."></textarea></label>',
      '<button class="btn btn-ghost" data-x type="button">Cancel</button>' +
      '<button class="btn btn-primary" id="ev-save" type="button">Add evidence</button>'
    );
    layer.querySelector("[data-x]").addEventListener("click", close);
    layer.querySelector("#ev-save").addEventListener("click", function () {
      var skillName = (layer.querySelector("#ev-skill").value || "").trim();
      var url = (layer.querySelector("#ev-url").value || "").trim();
      var desc = (layer.querySelector("#ev-desc").value || "").trim();
      if (!skillName) { JP.ui.toast("Name the skill this evidence supports."); return; }
      if (!url && !desc) { JP.ui.toast("Add a link or a short description."); return; }
      if (url && !/^https?:\/\//i.test(url)) { JP.ui.toast("Links must start with http:// or https://"); return; }
      JP.verifier.addEvidence({
        skill: skillName,
        type: layer.querySelector("#ev-type").value,
        url: url,
        source: url ? "User-provided link" : "User-provided description",
        description: desc,
      });
      JP.agents.log("Evidence Engine", JP.agents.S.COMPLETED, "Evidence submitted for \u201C" + skillName + "\u201D. Ledger re-evaluated.");
      close();
      JP.ui.toast("Evidence added \u2014 skill status updated.");
      if (cb) cb();
    });
    var first = layer.querySelector("#ev-skill");
    if (first) first.focus();
  }

  function recentSkills() {
    var f2 = JP.store.f2();
    var names = [];
    f2.skills.forEach(function (s) { if (s.required || s.claimed) names.push(s.name); });
    return names.slice(0, 12);
  }

  /* ---------- Complete mission -> AI review ---------- */

  function openMissionComplete(mission, cb) {
    var layer = shell(
      "Complete mission",
      '<p class="modal-text"><strong>' + esc(mission.title) + "</strong> \u2014 " + esc(mission.why) + "</p>" +
      '<label class="fld"><span>What did you accomplish?</span><textarea id="ms-done" rows="3" placeholder="Be specific \u2014 what exists now that didn\u2019t before?"></textarea></label>' +
      '<div class="fld-row">' +
      '<label class="fld"><span>Evidence type</span><select id="ms-ev-type">' +
      EV_TYPES.map(function (t) { return '<option value="' + t[0] + '">' + esc(t[1]) + "</option>"; }).join("") +
      "</select></label>" +
      '<label class="fld"><span>Evidence link</span><input id="ms-ev-url" type="url" placeholder="https://\u2026" /></label>' +
      "</div>" +
      '<label class="fld"><span>What did you learn?</span><textarea id="ms-learned" rows="2"></textarea></label>' +
      '<label class="fld"><span>What changed?</span><textarea id="ms-changed" rows="2" placeholder="What is different about your profile now?"></textarea></label>',
      '<button class="btn btn-ghost" data-x type="button">Cancel</button>' +
      '<button class="btn btn-primary" id="ms-submit" type="button">Submit for review</button>'
    );
    layer.querySelector("[data-x]").addEventListener("click", close);
    layer.querySelector("#ms-submit").addEventListener("click", function () {
      var done = (layer.querySelector("#ms-done").value || "").trim();
      var url = (layer.querySelector("#ms-ev-url").value || "").trim();
      if (done.length < 10) { JP.ui.toast("Describe what you accomplished \u2014 the review needs it."); return; }
      if (url && !/^https?:\/\//i.test(url)) { JP.ui.toast("Links must start with http:// or https://"); return; }

      var evType = layer.querySelector("#ms-ev-type").value;
      var learned = (layer.querySelector("#ms-learned").value || "").trim();
      var changed = (layer.querySelector("#ms-changed").value || "").trim();
      var descParts = [done];
      if (learned) descParts.push("Learned: " + learned);
      if (changed) descParts.push("Changed: " + changed);

      JP.missions.setStatus(mission.id, "Submitted");
      if (url || descParts.length) {
        JP.verifier.addEvidence({
          skill: mission.skill,
          type: evType,
          url: url,
          source: "Mission \u201C" + mission.title + "\u201D",
          description: descParts.join(" \u00b7 "),
          missionId: mission.id,
        });
      }

      // Re-evaluate with the new evidence — the review is computed,
      // not composed. Then set the mission status from the verdict.
      var d = JP.store.get();
      var res = JP.verifier.computeAll({ resume: d.resume, analysis: d.analysis });
      var sk = res.skills.find(function (s) {
        return s.name === mission.skill || s.key === (mission.skill || "").toLowerCase();
      });
      var verdict = sk ? sk.status : "INSUFFICIENT EVIDENCE";
      JP.missions.setStatus(mission.id, verdict === "VERIFIED" ? "Verified" : "Evidence Added");

      showReview(mission, {
        done: done,
        url: url,
        evType: evType,
        verdict: verdict,
        skill: sk,
      });
      if (cb) cb();
    });
    layer.querySelector("#ms-done").focus();
  }

  /* The review screen: evidence found / missing / skill status / next step. */

  function showReview(mission, r) {
    var statusCls = r.verdict === "VERIFIED" ? "is-verified" : r.verdict === "PARTIAL" ? "is-part" : "is-miss";
    var found = [];
    var missing = [];
    if (r.done) found.push("Written account of what you built and learned.");
    if (r.url) found.push((r.evType === "github" ? "A repository the agents can inspect." : "A linked artifact (" + r.evType + ")."));
    if (!r.url) missing.push("No inspectable artifact (repository, demo, or document) was attached \u2014 the claim rests on your description alone.");
    if (r.skill && r.skill.limitations) missing.push(r.skill.limitations);
    if (!found.length) found.push("Nothing yet.");

    var nextStep;
    if (r.verdict === "VERIFIED") {
      nextStep = "This skill is now verified for your target role. The career agent will move your next priority to the next gap.";
    } else if (r.verdict === "PARTIAL") {
      nextStep = "Good progress \u2014 status is now PARTIAL. To fully verify \u201C" + mission.skill + "\u201D, complete a verification interview (Proof Center) or attach a stronger artifact.";
    } else {
      nextStep = "The evidence doesn't establish \u201C" + mission.skill + "\u201D yet. " + (r.skill && r.skill.reason ? r.skill.reason : "Attach inspectable evidence and submit again.");
    }

    shell(
      "Mission review",
      '<p class="modal-text">JobProof reviewed the submission against the mission and your ledger. It never auto-verifies \u2014 status comes from evidence.</p>' +
      '<h3 class="sub-title">Evidence found</h3><ul>' + found.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" +
      (missing.length ? '<h3 class="sub-title">Evidence missing</h3><ul>' + missing.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" : "") +
      '<h3 class="sub-title">Skill status</h3>' +
      '<p><span class="status-pill ' + statusCls + '">' + esc(r.verdict) + "</span></p>" +
      '<h3 class="sub-title">Next step</h3><p>' + esc(nextStep) + "</p>",
      '<button class="btn btn-primary" data-x type="button">Done</button>'
    ).querySelector("[data-x]").addEventListener("click", close);
  }

  JP.modals = {
    openEvidence: openEvidence,
    openMissionComplete: openMissionComplete,
    close: close,
  };
})();
