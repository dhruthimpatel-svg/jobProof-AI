/* ============================================================
   JobProof AI — js/results.js
   Renders the full analysis result: score hero, triage, final
   block, honest block, and every detail section (match summary,
   ATS, keywords, hiring manager view, benchmark, priorities,
   rewrites with accept/edit/keep).
   ============================================================ */

(function () {
  "use strict";

  var JP = window.JP;
  JP.results = JP.results || {};
  var U = JP.util;
  var $ = function (id) { return document.getElementById(id); };
  var esc = U.escapeHtml;

  var state = { result: null, edits: {}, honest: false };

  /* ================= helpers ================= */

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function ringAnimate(score) {
    var fill = $("score-ring-fill");
    var value = $("score-value");
    var C = 326.7;
    fill.style.strokeDashoffset = C;
    // Force reflow so the transition always runs.
    void fill.getBoundingClientRect();
    fill.style.strokeDashoffset = String(C - (C * score) / 100);

    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) { value.textContent = score + "%"; return; }
    var start = null, dur = 1100;
    var done = false;
    // Background tabs never fire rAF — land on the real score regardless.
    var fallback = setTimeout(function () { value.textContent = score + "%"; }, dur + 300);
    function tick(ts) {
      if (done) return;
      if (!start) start = ts;
      var p = Math.min(1, (ts - start) / dur);
      var eased = 1 - Math.pow(1 - p, 3);
      value.textContent = Math.round(eased * score) + "%";
      if (p < 1) requestAnimationFrame(tick);
      else { done = true; clearTimeout(fallback); }
    }
    requestAnimationFrame(tick);
  }

  /* ================= main render ================= */

  JP.results.render = function (result, honest) {
    state.result = result;
    state.edits = {};
    state.honest = !!honest;

    /* --- score hero --- */
    ringAnimate(result.match.overall);
    $("score-verdict").textContent = result.match.verdict;
    $("score-disclaimer").textContent = result.match.disclaimer +
      (result.match.role ? " Detected role family: " + result.match.role.label + "." : "");
    renderBreakdown(result.match);
    $("score-breakdown").hidden = true;
    $("how-calc-btn").setAttribute("aria-expanded", "false");

    /* --- triage --- */
    renderTriage(result);

    /* --- final block --- */
    $("final-verdict").textContent = result.final.match + "% — " + result.final.verdict;
    var fix = $("fix-three");
    fix.innerHTML = "";
    result.final.fixThree.forEach(function (t) {
      fix.appendChild(el("li", "", esc(t)));
    });

    /* --- honest block --- */
    var hb = $("honest-block");
    if (state.honest) {
      $("honest-headline").textContent = result.honest.headline;
      var body = $("honest-body");
      body.innerHTML = "";
      result.honest.body.forEach(function (p) {
        body.appendChild(el("p", "", esc(p)));
      });
      var fx = $("honest-fix");
      fx.innerHTML = "";
      result.honest.fix.forEach(function (t) {
        fx.appendChild(el("li", "", esc(t)));
      });
      var note = el("p", "honest-note", esc(result.honest.note || ""));
      body.parentNode.insertBefore(note, fx);
      hb.hidden = false;
    } else {
      hb.hidden = true;
    }

    /* --- detail sections --- */
    renderMatchBuckets(result);
    renderAts(result.ats);
    renderKeywords(result.keywords);
    renderHiringManager(result.insights);
    renderBenchmark(result.benchmark);
    renderPriorities(result.priorities);
    renderRewrites(result);

    $("detail-sections").hidden = true;
    $("see-all-gaps-btn").textContent = "See all gaps";

    /* Company Target Mode: offer to train for this exact job (additive). */
    var trainHost = document.getElementById("final-block");
    if (trainHost && window.JP.company) {
      var oldBtn = document.getElementById("train-target-btn");
      if (oldBtn) oldBtn.remove();
      var tb = document.createElement("button");
      tb.className = "btn btn-ghost btn-sm";
      tb.id = "train-target-btn";
      tb.type = "button";
      tb.textContent = "Train for this target (Company Target Mode)";
      tb.addEventListener("click", function () { window.JP.company.fromCurrentJob(); });
      trainHost.appendChild(tb);
    }
  };

  /* ================= score breakdown ================= */

  function renderBreakdown(match) {
    var box = $("score-breakdown");
    box.innerHTML = "";
    match.categories.forEach(function (c) {
      if (typeof c.score !== "number") {
        var rowN = el("div", "score-break-row");
        rowN.innerHTML =
          '<span class="score-break-label">' + esc(c.label) + "</span>" +
          '<span class="score-break-detail">Not enough evidence to determine this.</span>';
        box.appendChild(rowN);
        return;
      }
      var row = el("div", "score-break-row");
      row.innerHTML =
        '<span class="score-break-label">' + esc(c.label) + "</span>" +
        '<span class="score-break-bar"><span style="width:' + c.score + '%"></span></span>' +
        '<span class="score-break-pct">' + c.score + "%</span>";
      box.appendChild(row);
      if (c.detail) {
        var d = el("div", "score-break-row");
        d.innerHTML = '<span class="score-break-label"></span><span class="score-break-detail">' + esc(c.detail) + "</span>";
        box.appendChild(d);
      }
    });
    var foot = el("p", "bench-note",
      "Weighted categories — the closer a category is to what this role screens on, the more it counts. Unjudgeable categories are excluded rather than counted against you.");
    box.appendChild(foot);
  }

  /* ================= triage ================= */

  function renderTriage(result) {
    var k = result.keywords;
    var strong = k.requiredFound.map(function (i) { return i.term; });
    var needs = k.requiredFound.filter(function (i) { return i.resumeCount < 2; })
      .concat(k.preferredMissing).map(function (i) { return i.term; });
    var missing = k.requiredMissing.map(function (i) { return i.term; });

    var grid = $("triage-grid");
    grid.innerHTML = "";

    grid.appendChild(bucket("Strong matches", "bucket-strong",
      "fa-circle-check", strong, "Skills this job asks for that your resume clearly shows."));
    grid.appendChild(bucket("Needs evidence", "bucket-evidence",
      "fa-triangle-exclamation", needs, "Mentioned once or only in preferred — worth strengthening if truthful."));
    grid.appendChild(bucket("Missing", "bucket-missing",
      "fa-circle-xmark", missing, "Required by this posting, absent from your resume."));

    function bucket(title, cls, icon, items, emptyMsg) {
      var b = el("div", "triage-bucket " + cls);
      b.appendChild(el("h3", "", '<i class="fa-solid ' + icon + '" aria-hidden="true"></i> ' + esc(title)));
      var ul = el("ul");
      if (!items.length) {
        ul.appendChild(el("li", "bucket-empty", esc(emptyMsg)));
      } else {
        items.slice(0, 6).forEach(function (t) {
          ul.appendChild(el("li", "", esc(t)));
        });
        if (items.length > 6) {
          ul.appendChild(el("li", "bucket-empty", "+" + (items.length - 6) + " more below"));
        }
      }
      b.appendChild(ul);
      return b;
    }
  }

  /* ================= match buckets ================= */

  function renderMatchBuckets(result) {
    var box = $("match-buckets");
    box.innerHTML = "";
    var k = result.keywords;

    box.appendChild(mb("Required — found", k.requiredFound.map(function (i) { return i.term; }), "ok"));
    box.appendChild(mb("Required — missing", k.requiredMissing.map(function (i) { return i.term; }), "bad"));
    var pref = k.preferredFound.map(function (i) { return i.term; })
      .concat(k.preferredMissing.map(function (i) { return i.term + " (missing)"; }));
    box.appendChild(mb("Preferred", pref, "warn"));

    function mb(title, items, tone) {
      var d = el("div", "match-bucket");
      d.appendChild(el("h4", "", esc(title)));
      var ul = el("ul");
      if (!items.length) ul.appendChild(el("li", "bucket-empty", "None detected."));
      items.forEach(function (t) {
        ul.appendChild(el("li", "", '<span class="risk-dot ' + tone + '"></span> ' + esc(t)));
      });
      d.appendChild(ul);
      return d;
    }
  }

  /* ================= ATS ================= */

  function renderAts(ats) {
    $("ats-summary").textContent = "ATS readability: " + ats.label + " — " + ats.summary;
    var list = $("ats-list");
    list.innerHTML = "";
    var icons = { good: "fa-circle-check", warn: "fa-triangle-exclamation", bad: "fa-circle-xmark" };
    ats.checks.forEach(function (c) {
      var li = el("li");
      li.innerHTML =
        '<span class="ats-check ' + c.status + '"><i class="fa-solid ' + icons[c.status] + '" aria-hidden="true"></i></span>' +
        '<span class="ats-label">' + esc(c.label) + "</span>" +
        '<span class="ats-detail">' + esc(c.detail) + "</span>";
      list.appendChild(li);
    });
  }

  /* ================= keywords ================= */

  function renderKeywords(kw) {
    var box = $("kw-groups");
    box.innerHTML = "";

    var groups = [
      { title: "Required keywords found", items: kw.requiredFound, tone: "found", kind: "found" },
      { title: "Required keywords missing", items: kw.requiredMissing, tone: "missing", kind: "missing" },
      { title: "Preferred keywords found", items: kw.preferredFound, tone: "found", kind: "found" },
      { title: "Preferred keywords missing", items: kw.preferredMissing, tone: "missing-preferred", kind: "missing" },
    ];

    groups.forEach(function (g) {
      var d = el("div", "kw-group");
      d.appendChild(el("h4", "", esc(g.title) + ' <span class="score-break-pct">(' + g.items.length + ")</span>"));
      var chips = el("div", "kw-chips");
      if (!g.items.length) {
        chips.appendChild(el("span", "bucket-empty", "None."));
      }
      g.items.forEach(function (item) {
        var chip = el("button", "kw-chip " + g.tone, esc(item.term));
        chip.type = "button";
        chip.addEventListener("click", function () {
          var existing = d.querySelector(".kw-detail");
          var wasActive = chip.classList.contains("active");
          if (existing) existing.remove();
          d.querySelectorAll(".kw-chip.active").forEach(function (c) { c.classList.remove("active"); });
          if (wasActive) return;
          chip.classList.add("active");
          var detail = el("div", "kw-detail");
          if (g.kind === "found") {
            detail.innerHTML = "<p class='kw-why'>Found in your resume" +
              (item.resumeCount > 1 ? " (" + item.resumeCount + " mentions)" : "") + "." +
              (item.resumeContext ? " Evidence: \u201C" + esc(clip(item.resumeContext, 160)) + "\u201D" : "") + "</p>";
          } else {
            detail.innerHTML =
              "<p class='kw-why'><b>Why it matters:</b> " + esc(item.why || "") + "</p>" +
              "<p class='kw-honest'>" + esc(item.honest || "") + "</p>";
          }
          chips.parentNode.insertBefore(detail, chips.nextSibling);
        });
        chips.appendChild(chip);
      });
      d.appendChild(chips);
      box.appendChild(d);
    });
  }

  function clip(s, n) {
    s = String(s || "").trim();
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
  }

  /* ================= hiring manager view ================= */

  function renderHiringManager(ins) {
    var box = $("hm-view");
    box.innerHTML = "";

    block("First impression", [ins.firstImpression].filter(Boolean));
    blockList("Deserves attention", ins.attention);
    blockList("Likely skimmed", ins.skim);
    blockList("Concerns", ins.concern);
    block("Fix first", ins.fixFirst);

    function block(label, lines) {
      if (!lines.length) return;
      var b = el("div", "hm-block");
      b.appendChild(el("p", "hm-label", esc(label)));
      lines.forEach(function (t) {
        b.appendChild(el("p", "hm-text", esc(t)));
      });
      box.appendChild(b);
    }

    function blockList(label, items) {
      if (!items || !items.length) return;
      var b = el("div", "hm-block");
      b.appendChild(el("p", "hm-label", esc(label)));
      items.forEach(function (it) {
        b.appendChild(el("p", "hm-text", esc(it.text)));
        if (it.bullets && it.bullets.length) {
          var ul = el("ul", "hm-bullets");
          it.bullets.forEach(function (x) { ul.appendChild(el("li", "", esc(x))); });
          b.appendChild(ul);
        }
        if (it.classification) {
          b.appendChild(el("span", "hm-classification", esc(it.classification)));
        }
      });
      box.appendChild(b);
    }
  }

  /* ================= benchmark ================= */

  function renderBenchmark(bench) {
    var box = $("bench-table");
    box.innerHTML = "";

    var head = el("div", "bench-row bench-head");
    head.innerHTML = "<span>Term</span><span>You</span><span class='bench-exp'>Role expectation</span><span>Basis</span>";
    box.appendChild(head);

    bench.rows.slice(0, 18).forEach(function (r) {
      var row = el("div", "bench-row");
      var levelCls = r.pct === 0 ? "level-no" : r.pct >= 80 ? "level-strong" : r.pct >= 60 ? "level-present" : "level-listed";
      var youCell = '<span class="bench-you ' + levelCls + '">' + esc(r.you) + "</span>";
      if (r.coreNote) youCell += '<br><span class="score-break-detail">' + esc(r.coreNote) + "</span>";
      row.innerHTML =
        '<span class="bench-term">' + esc(r.term) + "</span>" +
        "<span>" + youCell + "</span>" +
        "<span class='bench-exp'>" + esc(r.expectation) + "</span>" +
        '<span class="score-break-detail">' + esc(r.classification) + "</span>";
      box.appendChild(row);
    });
    if (bench.rows.length > 18) {
      box.appendChild(el("p", "bench-note", "+" + (bench.rows.length - 18) + " more requirements compared in the keyword section above."));
    }
    $("bench-note").textContent = bench.note;
  }

  /* ================= priorities ================= */

  function renderPriorities(pri) {
    var box = $("priority-list");
    box.innerHTML = "";
    if (!pri.items.length) {
      box.appendChild(el("p", "bucket-empty", "No priority fixes — the fundamentals are in place. Review the gaps above and decide what's worth adding."));
      return;
    }
    pri.items.forEach(function (p) {
      var d = el("div", "priority-item");
      d.innerHTML =
        '<span class="priority-rank">' + p.rank + "</span>" +
        '<p class="priority-title">' + esc(p.title) + ' <span class="hm-classification">' + esc(p.section) + "</span></p>" +
        '<p class="priority-why"><b>Why:</b> ' + esc(p.why) + "</p>" +
        '<p class="priority-what"><b>What to change:</b> ' + esc(p.what) + "</p>";
      box.appendChild(d);
    });
  }

  /* ================= rewrites ================= */

  function renderRewrites(result) {
    var box = $("rewrite-list");
    box.innerHTML = "";

    var offers = (result.rewrites || []).slice(0, 8);
    if (result.summaryRewrite) {
      offers = [{ section: "Summary", before: result.summaryRewrite.before, after: result.summaryRewrite.after, note: result.summaryRewrite.note, summary: true }].concat(offers);
    }

    if (!offers.length) {
      box.appendChild(el("p", "bucket-empty",
        "No rewrites offered. Your existing bullets already lead with actions, and nothing here invents improvements you didn't earn."));
      return;
    }

    offers.forEach(function (o, i) {
      var item = el("div", "rewrite-item");
      item.innerHTML =
        '<p class="rewrite-section">' + esc(o.section) + "</p>" +
        '<div class="rewrite-cols">' +
        '<div class="rewrite-col before"><p class="rewrite-tag">Before</p><p class="rewrite-text">' + esc(o.before) + "</p></div>" +
        '<div class="rewrite-col after"><p class="rewrite-tag">After</p><p class="rewrite-text">' + esc(o.after) + "</p></div>" +
        "</div>" +
        '<p class="rewrite-note">' + esc(o.note) + "</p>";

      var actions = el("div", "rewrite-actions");

      var accept = el("button", "btn btn-primary btn-sm", "Accept");
      accept.type = "button";
      accept.addEventListener("click", function () { apply(o, item, (state.edits[i] != null ? state.edits[i] : o.after)); });

      var edit = el("button", "btn btn-secondary btn-sm", "Edit");
      edit.type = "button";
      edit.addEventListener("click", function () {
        JP.ui.openEditModal(o.after, function (newText) {
          state.edits[i] = newText;
          item.querySelector(".rewrite-col.after .rewrite-text").textContent = newText;
          apply(o, item, newText);
        });
      });

      var keep = el("button", "btn btn-ghost btn-sm", "Keep Original");
      keep.type = "button";
      keep.addEventListener("click", function () {
        item.classList.add("is-kept");
        item.classList.remove("is-accepted");
        var tag = item.querySelector(".rewrite-accepted-tag");
        if (tag) tag.remove();
        actions.hidden = false;
        delete state.edits[i];
        JP.store.removeEdit(o.before);
        refreshFinal();
      });

      actions.appendChild(accept);
      actions.appendChild(edit);
      actions.appendChild(keep);
      item.appendChild(actions);
      box.appendChild(item);
    });

    function apply(o, item, finalText) {
      item.classList.add("is-accepted");
      item.classList.remove("is-kept");
      var actions = item.querySelector(".rewrite-actions");
      if (actions) actions.hidden = true;
      var old = item.querySelector(".rewrite-accepted-tag");
      if (old) old.remove();
      item.appendChild(el("p", "rewrite-accepted-tag",
        '<i class="fa-solid fa-check" aria-hidden="true"></i> Accepted — included in your updated draft'));
      JP.store.saveEdit({ section: o.section, before: o.before, after: finalText });
      refreshFinal();
    }

    function refreshFinal() {
      var edits = JP.store.getEdits();
      var n = edits.length;
      var btn = $("see-all-gaps-btn");
      if (n > 0) {
        var line = document.getElementById("updated-readiness");
        if (!line) {
          line = el("p", "home-note");
          line.id = "updated-readiness";
          $("final-block").querySelector(".final-card").appendChild(line);
        }
        line.textContent = n + " rewrite" + (n === 1 ? "" : "s") + " accepted. Updated draft is available on the Resume screen.";
      }
    }
  }
})();
