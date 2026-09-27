/* ============================================================
   JobProof AI — js/applications.js
   Feature 3 UI: Application Agent. Jobs come from pasted job
   descriptions or URLs the user supplies — never invented. Each
   saved job gets a real Feature 1 match analysis. The queue is
   prioritized with transparent reasons. Resume customization
   reuses Feature 1's rewriter/humanizer with accept/edit/reject,
   keeps versions, and exports the approved text only.
   ============================================================ */

(function () {
  "use strict";

  var JP = window.JP;
  var U = JP.util;
  var store = JP.store;
  var $ = function (id) { return document.getElementById(id); };
  var esc = U.escapeHtml;

  var currentTab = "discover";

  /* ================= render ================= */

  function render() {
    var root = $("apps-root");
    if (!root) return;
    var d = store.get();
    var role = roleLabel();

    var openCount = store.f3().saved.filter(function (s) { return s.status === "saved"; }).length;
    var appCount = store.f3().applications.length;

    root.innerHTML =
      '<h1 class="screen-title">Application Agent</h1>' +
      '<p class="screen-sub">Find the right jobs. Apply with proof.</p>' +
      '<div class="tabbar" role="tablist">' +
      tabBtn("discover", "Find Jobs") +
      tabBtn("queue", "Queue" + (openCount ? ' <span class="count-pill">' + openCount + "</span>" : "")) +
      tabBtn("tracking", "Applications" + (appCount ? ' <span class="count-pill">' + appCount + "</span>" : "")) +
      "</div>" +
      '<div id="apps-body"></div>';
    renderTab();
  }

  function tabBtn(key, label) {
    return '<button class="tab-btn' + (currentTab === key ? " is-active" : "") +
      '" data-tab="' + key + '" role="tab" aria-selected="' + (currentTab === key) + '" type="button">' + label + "</button>";
  }

  function roleLabel() {
    var d = store.get();
    return (d.job && d.job.title) || (d.analysis && d.analysis.match.role ? d.analysis.match.role.label : "Target role");
  }

  function renderTab() {
    var body = $("apps-body");
    if (!body) return;
    if (currentTab === "discover") body.innerHTML = discoverHtml() + savedListHtml();
    else if (currentTab === "queue") { body.innerHTML = queueHtml(); attachVersionsPanel(); }
    else body.innerHTML = trackingHtml();
    wireTab();
  }

  /* ================= Discover tab ================= */

  function discoverHtml() {
    return '<div class="card">' +
      '<h2 class="card-title">Add a job</h2>' +
      '<p class="card-sub">Paste a job description, or a posting URL. JobProof analyzes the real text — it does not search or invent listings.</p>' +
      '<label class="fld"><span>Job title</span><input id="jb-title" type="text" placeholder="e.g. Machine Learning Intern" /></label>' +
      '<div class="fld-row">' +
      '<label class="fld"><span>Company</span><input id="jb-company" type="text" placeholder="Company name" /></label>' +
      '<label class="fld"><span>Source URL (optional)</span><input id="jb-url" type="url" placeholder="https://\u2026" /></label>' +
      "</div>" +
      '<label class="fld"><span>Job description</span><textarea id="jb-text" rows="7" placeholder="Paste the full posting here \u2014 responsibilities, requirements, preferred skills."></textarea></label>' +
      '<div class="blocker-actions">' +
      '<button class="btn btn-primary" id="jb-analyze" type="button">Analyze &amp; save</button>' +
      "</div>" +
      '<p class="form-err" id="jb-err" hidden></p>' +
      "</div>";
  }

  function savedListHtml() {
    var f3 = store.f3();
    if (!f3.saved.length) {
      return '<div class="card"><h2 class="card-title">Saved jobs</h2>' +
        '<p class="muted">Nothing saved yet. Analyzed jobs land here with their real match score.</p></div>';
    }
    var rows = f3.saved.map(function (s) {
      var j = f3.jobs.find(function (x) { return x.id === s.jobId; });
      if (!j) return "";
      var score = j.analysis ? j.analysis.match.overall : null;
      return '<div class="card job-row" data-id="' + esc(s.id) + '">' +
        '<div class="job-row-main">' +
        '<p class="job-row-title">' + esc(j.title || "Untitled role") + (j.company ? " &middot; " + esc(j.company) : "") + "</p>" +
        '<p class="muted">' + (score != null ? "Role Match: " + score + "% (Feature 1 analysis)" : "Match not analyzed yet") +
        " &middot; saved " + esc(fmtDate(s.createdAt)) + "</p>" +
        "</div>" +
        '<span class="status-pill ' + pillForSave(s.status) + '">' + esc(saveLabel(s.status)) + "</span>" +
        '<div class="blocker-actions">' +
        '<button class="btn btn-secondary btn-sm" data-act="view">View</button>' +
        '<button class="btn btn-secondary btn-sm" data-act="customize">Customize</button>' +
        '<button class="btn btn-ghost btn-sm" data-act="remove">Remove</button>' +
        "</div></div>";
    }).join("");
    return '<h2 class="screen-subtitle">Saved jobs</h2>' + rows;
  }

  function saveLabel(st) { return st === "saved" ? "Saved" : st === "ready" ? "Ready to Apply" : "Applied"; }
  function pillForSave(st) { return st === "saved" ? "is-todo" : st === "ready" ? "is-progress" : "is-verified"; }

  function addJob() {
    var err = $("jb-err");
    var text = ($("jb-text").value || "").trim();
    var title = ($("jb-title").value || "").trim();
    var company = ($("jb-company").value || "").trim();
    var url = ($("jb-url").value || "").trim();
    err.hidden = true;

    if (url && !/^https?:\/\//i.test(url)) {
      return fail("Links must start with http:// or https://");
    }
    if (text.length < 80) {
      return fail("The job description is too short to analyze. Paste the full posting.");
    }
    var btn = $("jb-analyze");
    btn.disabled = true;
    btn.textContent = "Analyzing\u2026";

    var d = store.get();
    if (!d.resume || !d.resume.text) {
      btn.disabled = false;
      btn.textContent = "Analyze & save";
      return fail("Upload your resume on the Home screen first \u2014 the match needs it.");
    }

    // Real Feature 1 pipeline on the pasted text.
    JP.runAnalysis(d.resume.text, d.resume, { mode: "details", title: title, company: company, url: url, text: text },
      function () {})
      .then(function (analysis) {
        var f3 = store.f3();
        var job = {
          id: store.uid("job"),
          title: title || (analysis.match.role ? analysis.match.role.label : "Untitled role"),
          company: company,
          url: url,
          source: url ? "Pasted URL" : "Pasted description",
          lastChecked: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          analysis: analysis,
        };
        f3.jobs.unshift(job);
        f3.saved.unshift({ id: store.uid("sv"), jobId: job.id, status: "saved", createdAt: job.createdAt, notes: "" });
        store.save();
        JP.agents.log("Application Agent", JP.agents.S.COMPLETED,
          "Analyzed \u201C" + job.title + "\u201D \u2014 Role Match " + analysis.match.overall + "%.");
        $("jb-text").value = ""; $("jb-title").value = ""; $("jb-company").value = ""; $("jb-url").value = "";
        currentTab = "queue";
        render();
        JP.ui.toast("Saved. Role Match: " + analysis.match.overall + "%.");
      })
      .catch(function (e) {
        btn.disabled = false;
        btn.textContent = "Analyze & save";
        fail((e && e.userMessage) || "We couldn't analyze this posting. Try pasting the full description.");
      });

    function fail(msg) {
      err.textContent = msg;
      err.hidden = false;
    }
  }

  /* ================= Queue tab ================= */

  /* Transparent prioritization: requirement coverage and evidence
     strength from the real analysis. No hiring predictions. */

  function queueHtml() {
    var f3 = store.f3();
    var scored = f3.saved.map(function (s) {
      var j = f3.jobs.find(function (x) { return x.id === s.jobId; });
      if (!j) return null;
      return { saved: s, job: j };
    }).filter(Boolean);
    if (!scored.length) {
      return '<div class="card"><h2 class="card-title">Your Application Queue</h2>' +
        '<p class="muted">Save jobs on the Find Jobs tab and they will be prioritized here.</p></div>';
    }
    var groups = { first: [], review: [], low: [] };
    scored.forEach(function (entry) {
      var a = entry.job.analysis;
      var match = a ? a.match.overall : 0;
      var reqMissing = a ? a.keywords.requiredMissing.length : 0;
      if (!a) groups.review.push({ entry: entry, reason: "Not analyzed yet \u2014 open it to run the match." });
      else if (match >= 65 && reqMissing <= 2) groups.first.push({
        entry: entry,
        reason: "Strong alignment (" + match + "% match). " + (reqMissing ? reqMissing + " required keyword(s) missing." : "All required keywords covered."),
      });
      else if (match >= 45) groups.review.push({
        entry: entry,
        reason: "Workable overlap (" + match + "% match) but " + reqMissing + " required keyword(s) missing \u2014 review before applying.",
      });
      else groups.low.push({
        entry: entry,
        reason: "Low fit for now (" + match + "% match) \u2014 the requirements outpace the current evidence.",
      });
    });

    function section(title, arr) {
      if (!arr.length) return "";
      return '<h2 class="screen-subtitle">' + title + "</h2>" + arr.map(function (g) {
        var j = g.entry.job;
        var s = g.entry.saved;
        return '<div class="card job-row" data-id="' + esc(s.id) + '">' +
          '<div class="job-row-main">' +
          '<p class="job-row-title">' + esc(j.title) + (j.company ? " &middot; " + esc(j.company) : "") + "</p>" +
          '<p class="muted"><strong>Why:</strong> ' + esc(g.reason) + "</p>" +
          "</div>" +
          '<span class="status-pill ' + pillForSave(s.status) + '">' + esc(saveLabel(s.status)) + "</span>" +
          '<div class="blocker-actions">' +
          '<button class="btn btn-secondary btn-sm" data-act="view">View</button>' +
          '<button class="btn btn-secondary btn-sm" data-act="customize">Customize</button>' +
          (s.status === "saved" ? '<button class="btn btn-ghost btn-sm" data-act="ready">Mark ready</button>' : "") +
          "</div></div>";
      }).join("");
    }

    return '<div class="card"><h2 class="card-title">Your Application Queue</h2>' +
      '<p class="card-sub">A fit/readiness ordering \u2014 not a prediction of hiring outcomes.</p></div>' +
      section("Apply First", groups.first) +
      section("Review", groups.review) +
      section("Low Fit", groups.low);
  }

  /* ================= Tracking tab ================= */

  var STATUSES = ["Saved", "Preparing", "Ready to Apply", "Applied", "Interview", "Rejected", "Offer", "Withdrawn"];

  function trackingHtml() {
    var f3 = store.f3();
    var apps = f3.applications;
    if (!apps.length) {
      return '<div class="card"><h2 class="card-title">Applications</h2>' +
        '<p class="muted">No tracked applications yet. Mark a saved job as ready, then move it here when you apply.</p></div>';
    }
    var rows = apps.map(function (a) {
      var j = f3.jobs.find(function (x) { return x.id === a.jobId; });
      var opts = STATUSES.map(function (st) {
        return '<option value="' + esc(st) + '"' + (st === a.status ? " selected" : "") + ">" + esc(st) + "</option>";
      }).join("");
      return '<div class="card job-row" data-id="' + esc(a.id) + '">' +
        '<div class="job-row-main">' +
        '<p class="job-row-title">' + esc(j ? j.title : "Job") + (j && j.company ? " &middot; " + esc(j.company) : "") + "</p>" +
        '<p class="muted">' + (a.appliedAt ? "Applied " + esc(fmtDate(a.appliedAt)) : "Not applied yet") +
        (a.versionId ? " &middot; resume version on file" : "") + "</p>" +
        "</div>" +
        '<label class="fld fld-inline"><span class="visually-hidden">Status</span><select data-act="status">' + opts + "</select></label>" +
        '<div class="blocker-actions">' +
        '<button class="btn btn-ghost btn-sm" data-act="view-app">History</button>' +
        "</div></div>";
    }).join("");
    return '<h2 class="screen-subtitle">Recent Applications</h2>' + rows;
  }

  /* ================= Job detail view ================= */

  function viewJob(savedId) {
    var f3 = store.f3();
    var s = f3.saved.find(function (x) { return x.id === savedId; });
    if (!s) return;
    var j = f3.jobs.find(function (x) { return x.id === s.jobId; });
    if (!j) return;
    var a = j.analysis;

    var bring = "";
    if (a) {
      var reqs = a.match.evidence.requirements.filter(function (r) { return !r.extra; }).slice(0, 10);
      var lines = reqs.map(function (r) {
        var icon = r.resumeCount > 0 ? '<i class="fa-solid fa-check ok"></i>' : '<i class="fa-solid fa-xmark miss"></i>';
        var tag = r.tier === "preferred" ? " (preferred)" : "";
        return "<li>" + icon + " " + esc(r.label) + tag + "</li>";
      }).join("");
      bring = '<h3 class="sub-title">What they want vs what you bring</h3><ul class="bring-list">' + lines + "</ul>";
    }

    var before = "";
    if (a) {
      before = '<h3 class="sub-title">Before you apply</h3>' +
        "<p>" + esc(a.final.verdict) + " (" + a.match.overall + "% match)</p>" +
        (a.final.fixThree && a.final.fixThree.length
          ? "<ul>" + a.final.fixThree.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>"
          : "") +
        '<p class="muted">' + esc(a.final.disclaimer) + "</p>";
    }

    var layer = modalShell("Job detail",
      '<p class="modal-text"><strong>' + esc(j.title) + "</strong>" + (j.company ? " &middot; " + esc(j.company) : "") + "</p>" +
      '<p class="muted">Source: ' + esc(j.source) + (j.url ? ' &middot; <a href="' + esc(j.url) + '" target="_blank" rel="noopener noreferrer">posting</a>' : "") +
      " &middot; last checked " + esc(fmtDate(j.lastChecked)) + "</p>" +
      (a ? '<p class="muted">Role Match: <strong>' + a.match.overall + "%</strong> &mdash; " + esc(a.final.verdict) + "</p>" : '<p class="muted">Not analyzed yet.</p>') +
      bring + before,
      '<button class="btn btn-ghost" data-x type="button">Close</button>' +
      '<button class="btn btn-primary" data-go-customize type="button">Customize resume</button>');
    layer.querySelector("[data-x]").addEventListener("click", modalClose);
    layer.querySelector("[data-go-customize]").addEventListener("click", function () {
      modalClose();
      openCustomize(s.id);
    });
  }

  /* ================= Customize flow (Feature 1 engine reuse) ================= */

  function openCustomize(savedId) {
    var f3 = store.f3();
    var s = f3.saved.find(function (x) { return x.id === savedId; });
    var j = s && f3.jobs.find(function (x) { return x.id === s.jobId; });
    if (!j) return;
    var d = store.get();
    if (!d.resume || !d.resume.structured) {
      JP.ui.toast("Upload a resume first.");
      return;
    }
    var a = j.analysis;
    if (!a || !a.rewrites) {
      JP.ui.toast("This job has no analysis yet.");
      return;
    }

    var suggestions = [];
    a.rewrites.forEach(function (rw) {
      suggestions.push({ before: rw.before, after: rw.after, why: rw.note || "Clearer, evidence-first phrasing using only facts from your resume." });
    });
    if (a.summaryRewrite && a.summaryRewrite.after) {
      suggestions.unshift({ before: a.summaryRewrite.before, after: a.summaryRewrite.after, why: "Summary aligned to this job \u2014 same facts, sharper framing.", kind: "summary" });
    }

    if (!suggestions.length) {
      JP.ui.toast("Nothing to improve honestly for this job \u2014 no safe rewrites.");
      return;
    }

    var state = suggestions.map(function (sg) { return { sg: sg, choice: "pending", edited: null }; });

    function bodyHtml() {
      return state.map(function (item, i) {
        var c = item.choice;
        var st = c === "accepted" ? '<span class="status-pill is-verified">Accepted</span>'
          : c === "rejected" ? '<span class="status-pill is-miss">Rejected</span>' : "";
        var afterText = item.edited != null ? item.edited : item.sg.after;
        return '<div class="ba-block" data-i="' + i + '">' +
          '<p class="ba-label">Original</p><p class="ba-text">' + esc(item.sg.before) + "</p>" +
          '<p class="ba-label">Improved</p><p class="ba-text ba-after">' + esc(afterText) + "</p>" +
          '<p class="muted"><strong>Why:</strong> ' + esc(item.sg.why) + "</p>" +
          '<div class="blocker-actions">' +
          '<button class="btn btn-secondary btn-sm" data-c="accept" ' + (c === "accepted" ? "disabled" : "") + ">Accept</button>" +
          '<button class="btn btn-secondary btn-sm" data-c="edit">Edit</button>' +
          '<button class="btn btn-ghost btn-sm" data-c="reject" ' + (c === "rejected" ? "disabled" : "") + ">Reject</button>" +
          st + "</div></div>";
      }).join("") +
        '<h3 class="sub-title">Keyword honesty</h3>' +
        kwHonestyHtml(j.analysis) +
        '<p class="muted">Do not add a keyword you can\u2019t back up. Interviews expose padding.</p>';
    }

    var layer = modalShell("Customize resume", '<div id="cz-list">' + bodyHtml() + "</div>",
      '<button class="btn btn-ghost" data-x type="button">Close</button>' +
      '<button class="btn btn-primary" data-save-version type="button">Save version</button>');

    function refresh() { layer.querySelector("#cz-list").innerHTML = bodyHtml(); bindItems(); }

    function bindItems() {
      layer.querySelectorAll(".ba-block").forEach(function (block) {
        var i = parseInt(block.getAttribute("data-i"), 10);
        block.querySelectorAll("[data-c]").forEach(function (btn) {
          btn.addEventListener("click", function () {
            var c = btn.getAttribute("data-c");
            if (c === "accept") state[i].choice = "accepted";
            if (c === "reject") state[i].choice = "rejected";
            if (c === "edit") {
              JP.ui.openEditModal(state[i].edited != null ? state[i].edited : state[i].sg.after, function (val) {
                state[i].edited = val.trim();
                state[i].choice = val.trim() ? "accepted" : "pending";
              });
              return;
            }
            refresh();
          });
        });
      });
    }
    bindItems();

    layer.querySelector("[data-x]").addEventListener("click", modalClose);
    layer.querySelector("[data-save-version]").addEventListener("click", function () {
      var accepted = state.filter(function (it) { return it.choice === "accepted"; });
      if (!accepted.length) {
        JP.ui.toast("Accept or edit at least one change \u2014 or close without saving.");
        return;
      }
      var text = buildCustomizedResume(d.resume, accepted);
      var f3 = store.f3();
      var ver = {
        id: store.uid("ver"),
        jobId: j.id,
        savedId: s.id,
        name: "v" + (f3.versions.length + 1) + " \u2014 " + j.title + (j.company ? " / " + j.company : ""),
        createdAt: new Date().toISOString(),
        text: text,
        changes: accepted.map(function (it) {
          return { before: it.sg.before, after: it.edited != null ? it.edited : it.sg.after, why: it.sg.why, status: "accepted" };
        }),
      };
      f3.versions.unshift(ver);
      s.status = "ready";
      store.save();
      JP.agents.log("Application Agent", JP.agents.S.COMPLETED,
        "Resume customized for \u201C" + j.title + "\u201D \u2014 " + ver.changes.length + " accepted change(s). Version saved.");
      modalClose();
      currentTab = "queue";
      render();
      JP.ui.toast("Version saved. Job marked Ready to Apply.");
    });
  }

  function kwHonestyHtml(a) {
    var f = a.keywords.requiredFound.slice(0, 6).map(function (k) { return "<li>" + esc(k.term) + "</li>"; }).join("");
    var m = a.keywords.requiredMissing.slice(0, 6).map(function (k) {
      return "<li>" + esc(k.term) + ' <span class="muted">\u2014 only add if you genuinely have it</span></li>';
    }).join("");
    return "<ul>" + (f || m || "<li>None flagged.</li>") + "</ul>";
  }

  /* Apply accepted changes to the stored resume text (replace before
     with after; the original version is never touched). */
  function buildCustomizedResume(resume, accepted) {
    var text = resume.text || "";
    accepted.forEach(function (it) {
      var after = it.edited != null ? it.edited : it.sg.after;
      if (it.sg.kind === "summary") return; // summary handled below
      if (text.indexOf(it.sg.before) !== -1) {
        text = text.split(it.sg.before).join(after);
      }
    });
    var summary = accepted.filter(function (it) { return it.sg.kind === "summary"; })[0];
    if (summary) {
      var after = summary.edited != null ? summary.edited : summary.sg.after;
      if (summary.sg.before && text.indexOf(summary.sg.before) !== -1) {
        text = text.split(summary.sg.before).join(after);
      } else {
        text = after + "\n\n" + text;
      }
    }
    return text;
  }

  /* ================= Export (approved versions only) ================= */

  function exportVersion(verId, format) {
    var f3 = store.f3();
    var v = f3.versions.find(function (x) { return x.id === verId; });
    if (!v) return;
    var safe = v.name.replace(/[^\w-]+/g, "_").slice(0, 60);
    if (format === "txt") {
      U.downloadText(safe + ".txt", v.text);
      JP.ui.toast("Exported " + safe + ".txt");
      return;
    }
    if (format === "docx") {
      exportDocx(safe, v.text);
      return;
    }
    if (format === "pdf") {
      exportPdf(safe, v.text);
      return;
    }
  }

  /* Minimal, dependency-free DOCX: Word opens an HTML document
     saved with the .doc extension reliably; a real zip-based .docx
     needs a library — use HTML-in-doc which Word handles natively. */
  function exportDocx(name, text) {
    var html = '<html><head><meta charset="utf-8"></head><body>' +
      text.split(/\n{2,}/).map(function (p) { return "<p>" + U.escapeHtml(p).replace(/\n/g, "<br>") + "</p>"; }).join("") +
      "</body></html>";
    var blob = new Blob(["\ufeff", html], { type: "application/msword" });
    downloadBlob(name + ".doc", blob);
    JP.ui.toast("Exported for Word (" + name + ".doc)");
  }

  /* Minimal PDF via the browser's own print-to-PDF. */
  function exportPdf(name, text) {
    var w = window.open("", "_blank");
    if (!w) { JP.ui.toast("Allow pop-ups to export PDF."); return; }
    w.document.write(
      '<html><head><title>' + U.escapeHtml(name) + '</title>' +
      '<style>body{font-family:Georgia,serif;margin:48px;color:#111;line-height:1.5}p{margin:0 0 10px}</style>' +
      '</head><body>' +
      text.split(/\n{2,}/).map(function (p) { return "<p>" + U.escapeHtml(p).replace(/\n/g, "<br>") + "</p>"; }).join("") +
      '<script>window.onload=function(){setTimeout(function(){window.print()},150)}<\/script>' +
      "</body></html>");
    w.document.close();
    JP.ui.toast("Use the print dialog \u2192 Save as PDF.");
  }

  function downloadBlob(filename, blob) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 500);
  }

  /* ================= Version history ================= */

  function versionsHtml(savedId) {
    var f3 = store.f3();
    var vers = f3.versions.filter(function (v) { return !savedId || v.savedId === savedId; });
    if (!vers.length) return '<p class="muted">No versions saved.</p>';
    return vers.map(function (v) {
      return '<div class="version-row" data-id="' + esc(v.id) + '">' +
        "<p><strong>" + esc(v.name) + "</strong> &middot; " + esc(fmtDate(v.createdAt)) + " &middot; " +
        v.changes.length + " accepted change(s)</p>" +
        '<div class="blocker-actions">' +
        '<button class="btn btn-ghost btn-sm" data-vact="view">View</button>' +
        '<button class="btn btn-ghost btn-sm" data-vact="pdf">Export PDF</button>' +
        '<button class="btn btn-ghost btn-sm" data-vact="docx">Export DOC</button>' +
        '<button class="btn btn-ghost btn-sm" data-vact="txt">Export TXT</button>' +
        "</div></div>";
    }).join("");
  }

  /* ================= shared modal shell (F3-local) ================= */

  var openLayer = null;
  function modalClose() {
    if (openLayer && openLayer.parentNode) openLayer.parentNode.removeChild(openLayer);
    openLayer = null;
    document.removeEventListener("keydown", onKey);
  }
  function onKey(e) { if (e.key === "Escape") modalClose(); }
  function modalShell(title, bodyHtml, footHtml) {
    modalClose();
    var layer = document.createElement("div");
    layer.className = "modal-overlay jp-layer";
    layer.innerHTML =
      '<div class="modal modal-wide" role="dialog" aria-modal="true" aria-label="' + esc(title) + '">' +
      '<button class="modal-close" type="button" aria-label="Close">&times;</button>' +
      "<h2>" + esc(title) + "</h2>" + bodyHtml +
      '<div class="modal-actions">' + (footHtml || "") + "</div></div>";
    document.body.appendChild(layer);
    openLayer = layer;
    layer.addEventListener("mousedown", function (e) { if (e.target === layer) modalClose(); });
    layer.querySelector(".modal-close").addEventListener("click", modalClose);
    document.addEventListener("keydown", onKey);
    return layer;
  }

  /* ================= Application record creation ================= */

  function createApplication(savedId) {
    var f3 = store.f3();
    var s = f3.saved.find(function (x) { return x.id === savedId; });
    if (!s) return;
    var exists = f3.applications.find(function (a) { return a.savedId === savedId; });
    if (exists) return exists;
    var j = f3.jobs.find(function (x) { return x.id === s.jobId; });
    var latestVersion = f3.versions.find(function (v) { return v.savedId === savedId; });
    var app = {
      id: store.uid("app"),
      savedId: savedId,
      jobId: s.jobId,
      role: j ? j.title : "",
      company: j ? j.company : "",
      status: "Ready to Apply",
      appliedAt: null,
      versionId: latestVersion ? latestVersion.id : null,
      notes: "",
      createdAt: new Date().toISOString(),
    };
    f3.applications.unshift(app);
    s.status = "ready";
    store.save();
    return app;
  }

  /* ================= wiring ================= */

  function fmtDate(iso) {
    try { return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
    catch (e) { return ""; }
  }

  function wireTab() {
    document.querySelectorAll("#apps-root .tab-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        currentTab = btn.dataset.tab;
        render();
      });
    });
    var analyzeBtn = $("jb-analyze");
    if (analyzeBtn) analyzeBtn.addEventListener("click", addJob);

    document.querySelectorAll("#apps-body .job-row button[data-act]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var row = btn.closest(".job-row");
        var id = row.getAttribute("data-id");
        var act = btn.getAttribute("data-act");
        var f3 = store.f3();
        var s = f3.saved.find(function (x) { return x.id === id; });
        if (!s) return;
        if (act === "view") { viewJob(id); return; }
        if (act === "customize") { openCustomize(id); return; }
        if (act === "remove") {
          f3.saved = f3.saved.filter(function (x) { return x.id !== id; });
          store.save();
          render();
          return;
        }
        if (act === "ready") {
          createApplication(id);
          JP.ui.toast("Marked Ready to Apply. Track it in Applications.");
          render();
          return;
        }
        if (act === "view-app") {
          var app = f3.applications.find(function (a) { return a.savedId === id; }) ||
            f3.applications.find(function (a) { return a.id === id; });
          if (app) viewApplication(app.id);
        }
      });
    });

    document.querySelectorAll('#apps-body [data-act="status"]').forEach(function (sel) {
      sel.addEventListener("change", function () {
        var row = sel.closest(".job-row");
        var app = store.f3().applications.find(function (a) { return a.id === row.getAttribute("data-id"); });
        if (!app) return;
        app.status = sel.value;
        if (sel.value === "Applied" && !app.appliedAt) app.appliedAt = new Date().toISOString();
        store.save();
        JP.ui.toast("Status: " + sel.value);
        render();
      });
    });
  }

  function viewApplication(appId) {
    var f3 = store.f3();
    var app = f3.applications.find(function (a) { return a.id === appId; });
    if (!app) return;
    var ver = f3.versions.find(function (v) { return v.id === app.versionId; });
    var layer = modalShell("Application history",
      '<p class="modal-text"><strong>' + esc(app.role) + "</strong>" + (app.company ? " &middot; " + esc(app.company) : "") + "</p>" +
      '<p class="muted">Status: ' + esc(app.status) + (app.appliedAt ? " &middot; applied " + esc(fmtDate(app.appliedAt)) : "") + "</p>" +
      (app.versionId
        ? '<h3 class="sub-title">Resume version used</h3>' + versionsHtml(app.savedId)
        : '<p class="muted">No customized resume version was saved for this application.</p>'),
      '<button class="btn btn-primary" data-x type="button">Close</button>');
    layer.querySelector("[data-x]").addEventListener("click", modalClose);
    layer.querySelectorAll("[data-vact]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.closest(".version-row").getAttribute("data-id");
        exportVersion(id, btn.getAttribute("data-vact"));
      });
    });
  }

  /* Versions panel lives on the Queue tab for saved jobs with versions. */
  function attachVersionsPanel() {
    var f3 = store.f3();
    if (!f3.versions.length) return;
    var host = $("apps-body");
    if (!host) return;
    var panel = document.createElement("div");
    panel.className = "card";
    panel.innerHTML = '<h2 class="card-title">Resume versions</h2>' + versionsHtml();
    host.appendChild(panel);
    panel.querySelectorAll("[data-vact]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.closest(".version-row").getAttribute("data-id");
        exportVersion(id, btn.getAttribute("data-vact"));
      });
    });
  }

  JP.applications = {
    render: render,
    attachVersionsPanel: attachVersionsPanel,
  };
})();
