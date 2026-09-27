/* ============================================================
   JobProof AI — js/github.js
   GitHub / Project Agent. Fetches public repository metadata via
   GitHub's public API (CORS-enabled). Verifies only what it can
   actually see. Accessible -> real analysis. Inaccessible ->
   clear NEEDS_INPUT message. Never fabricates repository data.
   ============================================================ */

(function () {
  "use strict";

  var JP = window.JP;
  var store = JP.store;

  function parseUsername(url) {
    var m = String(url || "").match(/github\.com\/([A-Za-z0-9-]{1,39})/i);
    return m ? m[1] : null;
  }

  /* Fetch public profile + repos. Resolves (never rejects) so the
     orchestrator can always continue; `ok:false` means it will say
     why it couldn't verify rather than pretend. */

  function fetchProfile(url) {
    var user = parseUsername(url);
    if (!user) {
      return Promise.resolve({
        ok: false,
        message: "No GitHub profile connected. Add your GitHub URL in Profile to have your repositories analyzed.",
        network: false,
      });
    }
    var base = "https://api.github.com/users/" + encodeURIComponent(user);
    return Promise.all([
      fetchJson(base),
      fetchJson(base + "/repos?per_page=30&sort=updated"),
    ]).then(function (rs) {
      var profile = rs[0], repos = rs[1];
      if (profile.err) {
        return { ok: false, message: statusMessage(profile.status, user), network: true };
      }
      if (repos.err) {
        return { ok: false, message: "GitHub listed the profile but wouldn't return repository data (" + repos.status + ").", network: true };
      }
      var mapped = (repos.data || []).map(function (r) {
        return {
          name: r.name,
          description: r.description || "",
          url: r.html_url,
          language: r.language || "",
          languages: [r.language].filter(Boolean),
          stars: r.stargazers_count || 0,
          forks: r.forks_count || 0,
          updatedAt: r.updated_at,
          topics: r.topics || [],
        };
      });
      return { ok: true, user: profile.data.login, repos: mapped };
    });
  }

  /* Deeper look at one repository: languages actually used. */
  function fetchRepoLanguages(repoUrl) {
    var m = String(repoUrl || "").match(/github\.com\/([^\/]+)\/([^\/#?]+)/i);
    if (!m) return Promise.resolve({ ok: false, message: "Not a GitHub repository URL." });
    var api = "https://api.github.com/repos/" + m[1] + "/" + m[2].replace(/\.git$/, "") + "/languages";
    return fetchJson(api).then(function (r) {
      if (r.err) return { ok: false, message: statusMessage(r.status, m[2]) };
      var langs = Object.keys(r.data || {});
      return { ok: true, languages: langs };
    });
  }

  function fetchJson(url) {
    return fetch(url, { headers: { Accept: "application/vnd.github+json" } })
      .then(function (res) {
        if (!res.ok) return { err: true, status: res.status, data: null };
        return res.json().then(function (data) { return { err: false, status: 200, data: data }; });
      })
      .catch(function () {
        return { err: true, status: 0, data: null };
      });
  }

  function statusMessage(status, user) {
    if (status === 404) return "No public GitHub profile named \u201C" + user + "\u201D was found.";
    if (status === 403 || status === 429) return "GitHub's public API rate limit was reached. Try again in a few minutes.";
    if (status === 0) return "We couldn't reach github.com from this browser (network or connection issue).";
    return "GitHub responded with an error (" + status + ").";
  }

  JP.github = {
    parseUsername: parseUsername,
    fetchProfile: fetchProfile,
    fetchRepoLanguages: fetchRepoLanguages,
  };
})();
