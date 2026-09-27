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
          var local = JP.store.get();
          var serverEmpty = isStateEmpty(serverState);
          var localEmpty = isStateEmpty(local);
          var stamp = serverState && serverState.updatedAt;

          if (serverEmpty && !localEmpty) {
            // First time this workspace sees the server: upload local data.
            return api.saveState(snapshot(local)).then(function () {
              state.online = true;
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
        })
        .catch(function () {
          state.online = false;
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

  JP.api = api;
  JP._apiState = state;
})();
