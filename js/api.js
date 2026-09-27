/* ============================================================
   JobProof AI — js/api.js
   Backend client. Every network call goes through here.
   The server is the source of truth: state lives in SQLite,
   analysis runs server-side, files are extracted server-side.
   If the server is unreachable the app keeps working in-browser
   and says so honestly.
   ============================================================ */

(function () {
  "use strict";

  var JP = (window.JP = window.JP || {});

  var WORKSPACE_KEY = "jobproof.workspace";
  var STAMP_KEY = "jobproof.lastServerStamp";
  var RELOAD_KEY = "jobproof.syncReload";

  var state = {
    online: false,
    workspaceId: localStorage.getItem(WORKSPACE_KEY) || null,
    serverState: null,
    pending: [], // queued saves while offline
    connecting: false,
  };

  function wsId() {
    if (!state.workspaceId) {
      var seg = function () {
        return Math.random().toString(36).slice(2, 6).toUpperCase();
      };
      state.workspaceId = seg() + "-" + seg();
      localStorage.setItem(WORKSPACE_KEY, state.workspaceId);
    }
    return state.workspaceId;
  }

  function req(method, path, body, opts) {
    opts = opts || {};
    var headers = { "X-Workspace": wsId() };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    return fetch(path, {
      method: method,
      headers: headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then(function (r) {
      if (!r.ok) {
        return r.json().catch(function () { return {}; }).then(function (e) {
          throw { userMessage: (e && e.error) || "Server error (" + r.status + ")", status: r.status };
        });
      }
      return r.json();
    });
  }

  var api = {
    workspaceId: wsId,
    isOnline: function () { return state.online; },

    /* ---- boot: pull server state ---- */
    boot: function () {
      return req("GET", "/api/state").then(function (res) {
        state.online = true;
        state.serverState = res.state;
        return res.state;
      });
    },

    /* ---- connect at page load: hydrate from server or push local up ---- */
    connect: function () {
      if (state.connecting) return Promise.resolve();
      state.connecting = true;
      return api.boot()
        .then(function (serverState) {
          renderSyncCard();
          var local = JP.store.get();
          var serverEmpty = isStateEmpty(serverState);
          var localEmpty = isStateEmpty(local);
          var stamp = serverState && serverState.updatedAt;

          if (serverEmpty && !localEmpty) {
            // First time this workspace sees the server: upload local data.
            return api.saveState(snapshot(local)).then(function () {
              state.online = true;
              noteSync("Uploaded this browser's data to the server.");
            });
          }
          if (!serverEmpty && stamp && stamp !== localStorage.getItem(STAMP_KEY) && !sessionStorage.getItem(RELOAD_KEY)) {
            // Server has newer/different data (another device, or first sync):
            // adopt it as the source of truth and refresh once.
            adoptServerState(serverState);
            localStorage.setItem(STAMP_KEY, stamp);
            sessionStorage.setItem(RELOAD_KEY, "1");
            location.reload();
            return;
          }
          if (!serverEmpty) {
            localStorage.setItem(STAMP_KEY, stamp || "");
          }
          noteSync(null);
        })
        .catch(function () {
          state.online = false;
          renderSyncCard();
        })
        .then(function () { state.connecting = false; });
    },

    /* ---- push mutations (called by the store on save) ---- */
    saveState: function (patch) {
      if (!state.online) {
        state.pending.push(patch);
        return Promise.resolve();
      }
      return req("POST", "/api/state", patch)
        .then(function (res) {
          if (res.state && res.state.updatedAt) localStorage.setItem(STAMP_KEY, res.state.updatedAt);
        })
        .catch(function () {
          state.online = false;
          state.pending.push(patch);
          renderSyncCard();
        });
    },

    flushPending: function () {
      if (!state.online || !state.pending.length) return Promise.resolve();
      var jobs = state.pending.splice(0, state.pending.length);
      return Promise.all(jobs.map(function (p) { return api.saveState(p); }));
    },

    /* ---- analysis runs server-side ---- */
    analyze: function (payload) {
      return req("POST", "/api/analyze", payload).then(function (res) { return res; });
    },

    /* ---- file extraction on the server ---- */
    extractFile: function (file) {
      var fd = new FormData();
      fd.append("file", file, file.name);
      return fetch("/api/extract", { method: "POST", headers: { "X-Workspace": wsId() }, body: fd })
        .then(function (r) {
          if (!r.ok) {
            return r.json().catch(function () { return {}; }).then(function (e) {
              throw { userMessage: (e && e.error) || "Could not read that file on the server." };
            });
          }
          return r.json();
        });
    },

    /* ---- full wipe (Settings → Delete everything) ---- */
    deleteAll: function () {
      if (!state.online) return Promise.resolve();
      return req("DELETE", "/api/state").catch(function () {});
    },

    /* ---- link this browser to an existing workspace ---- */
    linkWorkspace: function (code) {
      code = String(code || "").trim().toUpperCase();
      if (!/^[A-Z0-9-]{4,64}$/.test(code)) {
        return Promise.reject({ userMessage: "That doesn't look like a workspace code (letters, digits, dashes)." });
      }
      state.workspaceId = code;
      localStorage.setItem(WORKSPACE_KEY, code);
      localStorage.removeItem(STAMP_KEY);
      sessionStorage.removeItem(RELOAD_KEY);
      return api.boot().then(function () {
        location.reload();
      });
    },

    unlinkWorkspace: function () {
      localStorage.removeItem(WORKSPACE_KEY);
      localStorage.removeItem(STAMP_KEY);
      sessionStorage.removeItem(RELOAD_KEY);
      state.workspaceId = null;
      wsId();
      location.reload();
    },
  };

  function isStateEmpty(s) {
    if (!s) return true;
    return !s.resume && !s.analysis &&
      !(s.f2 && ((s.f2.skills || []).length || (s.f2.missions || []).length)) &&
      !(s.f3 && (s.f3.jobs || []).length) &&
      !(s.f4 && (s.f4.targets || []).length);
  }

  function snapshot(d) {
    // Whole-state snapshot minus server-managed bookkeeping.
    var copy = {};
    for (var k in d) {
      if (k === "updatedAt" || k === "version") continue;
      copy[k] = d[k];
    }
    return copy;
  }

  function adoptServerState(serverState) {
    var base = {
      resume: null, job: null, analysis: null, edits: [],
      settings: { brutallyHonest: false }, profile: null, activity: [], version: 1,
    };
    var merged = {};
    for (var k in base) merged[k] = base[k];
    for (var k2 in serverState) {
      if (k2 === "updatedAt" || k2 === "version") continue;
      merged[k2] = serverState[k2];
    }
    JP.store._data = merged;
    JP.store.save(); // persists to localStorage too (offline-safe)
  }

  function noteSync(msg) {
    var el = document.getElementById("jp-sync-note");
    if (el && msg) el.textContent = msg;
  }

  /* ---- Settings card: server sync status + device linking ---- */

  function renderSyncCard() {
    var wrap = document.querySelector(".settings-wrap");
    if (!wrap || document.getElementById("jp-sync-card")) return;
    var card = document.createElement("div");
    card.className = "card";
    card.id = "jp-sync-card";
    var status = state.online
      ? '<span class="status-pill is-verified">Server sync on</span>'
      : '<span class="status-pill is-warn">Offline — working in-browser</span>';
    card.innerHTML =
      '<h2 class="card-title">Server &amp; sync</h2>' +
      '<p class="card-sub">Your data lives on the JobProof server in workspace <strong>' +
      String(state.workspaceId || "").replace(/</g, "&lt;") +
      "</strong>. Use the same code on another device to open the same profile.</p>" +
      '<p class="muted" id="jp-sync-note">' + (state.online ? "Connected — analysis and storage run on the backend." : "Server unreachable — the app keeps working locally and will sync when it's back.") + "</p>" +
      '<div class="settings-actions">' +
      '<input type="text" id="jp-link-code" placeholder="Workspace code, e.g. K7P2-M4XQ" style="max-width:260px" />' +
      '<button class="btn btn-secondary btn-sm" id="jp-link-btn" type="button">Link device</button>' +
      (state.online ? '<button class="btn btn-ghost btn-sm" id="jp-unlink-btn" type="button">New workspace</button>' : "") +
      "</div>";
    wrap.appendChild(card);
    var linkBtn = card.querySelector("#jp-link-btn");
    if (linkBtn) linkBtn.addEventListener("click", function () {
      var code = card.querySelector("#jp-link-code").value;
      api.linkWorkspace(code).catch(function (e) { JP.ui.toast(e.userMessage || "Could not link that workspace."); });
    });
    var unlinkBtn = card.querySelector("#jp-unlink-btn");
    if (unlinkBtn) unlinkBtn.addEventListener("click", function () { api.unlinkWorkspace(); });
  }

  JP.api = api;
  JP._apiState = state;
})();
