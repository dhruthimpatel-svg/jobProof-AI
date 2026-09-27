/* ============================================================
   JobProof AI — js/core.js
   Namespace, generic utilities, localStorage-backed store.
   Feature modules plug into window.JP.
   ============================================================ */

(function () {
  "use strict";

  var JP = (window.JP = window.JP || {});

  /* ---------------- Utilities ---------------- */

  var U = {};

  U.norm = function (s) {
    return String(s == null ? "" : s)
      .toLowerCase()
      .replace(/[\u2018\u2019\u201b]/g, "'")
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/\u00a0/g, " ");
  };

  U.titleCase = function (s) {
    return String(s || "").replace(/\w[\w'&.-]*/g, function (w) {
      if (w.length <= 3 && /^(api|sql|css|xml|aws|gcp|etl|crm|seo|ux|ui|qa|ba|bi|it|ml|ai)$/i.test(w)) return w.toUpperCase();
      if (/^(javascript|typescript|node\.?js|mongodb|mysql|postgresql|github|gitlab|pytorch|tensorflow|docker|kubernetes|devops|nosql|graphql|sass|scss|react\.js|vue\.js|angular\.js|next\.?js)$/.test(U.norm(w))) {
        return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      }
      return w.charAt(0).toUpperCase() + w.slice(1);
    });
  };

  U.escapeHtml = function (s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  };

  U.clamp = function (v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  };

  U.copyText = function (text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  };

  U.downloadText = function (filename, text) {
    var blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 500);
  };

  U.today = function () {
    try {
      return new Date().toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    } catch (e) {
      return new Date().toDateString();
    }
  };

  U.greeting = function () {
    var h = new Date().getHours();
    if (h < 5) return "Working late";
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  };

  /* ---------------- Store ---------------- */
  /* Everything lives under a single localStorage key. The resume
     file never leaves the device; "Delete my data" clears it all. */

  var STORE_KEY = "jobproof.v1";

  function defaults() {
    return {
      resume: null, // { name, fileName, size, uploadedAt, text, structured }
      job: null, // { mode:'text'|'details', title, company, url, text }
      analysis: null, // full pipeline result
      edits: [], // accepted rewrites: { section, before, after }
      settings: { brutallyHonest: false },
      profile: null, // { name, githubUrl, linkedinUrl } — onboarding/profile data
      f2: null, // career readiness: skills, evidence, gaps, missions, interviews, history, reports
      f3: null, // applications: jobs, saved, applications, versions, changes
      activity: [], // agent_runs log — every agent action is recorded here
      version: 1,
    };
  }

  var store = {
    _data: null,

    load: function () {
      try {
        var raw = localStorage.getItem(STORE_KEY);
        this._data = raw ? Object.assign(defaults(), JSON.parse(raw)) : defaults();
      } catch (e) {
        this._data = defaults();
      }
      if (!this._data.settings) this._data.settings = defaults().settings;
      return this._data;
    },

    get: function () {
      if (!this._data) this.load();
      return this._data;
    },

    save: function () {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(this._data));
      } catch (e) {
        // Storage may be full or blocked; the session still works in memory.
      }
      /* Server sync: push a shallow snapshot to the backend when connected.
         Failures are swallowed — the local copy remains the working set. */
      if (window.JP && JP.api && JP.api.isOnline && JP.api.isOnline()) {
        try { JP.api.saveState(this._data); } catch (e) {}
      }
    },

    setResume: function (resume) {
      this.get().resume = resume;
      this.save();
    },

    setJob: function (job) {
      this.get().job = job;
      this.save();
    },

    setAnalysis: function (analysis) {
      this.get().analysis = analysis;
      this.save();
    },

    setHonest: function (on) {
      this.get().settings.brutallyHonest = !!on;
      this.save();
    },

    deleteResume: function () {
      this.get().resume = null;
      this.get().analysis = null;
      this.save();
    },

    deleteAnalysis: function () {
      this.get().analysis = null;
      this.save();
    },

    deleteAll: function () {
      try {
        localStorage.removeItem(STORE_KEY);
      } catch (e) {}
      this._data = defaults();
    },

    /* ---- Accepted rewrites ---- */

    saveEdit: function (edit) {
      var d = this.get();
      if (!d.edits) d.edits = [];
      var i = d.edits.findIndex(function (e) { return e.before === edit.before; });
      if (i !== -1) d.edits[i] = edit;
      else d.edits.push(edit);
      this.save();
    },

    getEdits: function () {
      var d = this.get();
      return d.edits || [];
    },

    removeEdit: function (beforeText) {
      var d = this.get();
      if (!d.edits) return;
      d.edits = d.edits.filter(function (e) { return e.before !== beforeText; });
      this.save();
    },

    clearEdits: function () {
      this.get().edits = [];
      this.save();
    },

    /* ---- Feature 2/3/4 collections ---- */
    /* These collections are created lazily so older stored state
       (before Features 2–4) keeps loading without migration. */

    f2: function () {
      var d = this.get();
      if (!d.f2) {
        d.f2 = { skills: [], evidence: [], gaps: [], missions: [], interviews: [], history: [], reports: [] };
        this.save();
      }
      return d.f2;
    },

    f3: function () {
      var d = this.get();
      if (!d.f3) {
        d.f3 = { jobs: [], saved: [], applications: [], versions: [], changes: [] };
        this.save();
      }
      return d.f3;
    },

    f4: function () {
      /* Company Target Mode collections (targets + active pointer). */
      var d = this.get();
      if (!d.f4) {
        d.f4 = { targets: [], activeId: null };
        this.save();
      }
      return d.f4;
    },

    profile: function () {
      var d = this.get();
      if (!d.profile) {
        d.profile = { name: "", githubUrl: "", linkedinUrl: "" };
        this.save();
      }
      return d.profile;
    },

    uid: function (prefix) {
      this._uidCounter = (this._uidCounter || Math.floor(Date.now() / 1000)) + 1;
      return prefix + "-" + this._uidCounter.toString(36) + Math.random().toString(36).slice(2, 6);
    },
  };

  JP.util = U;
  JP.store = store;
})();
