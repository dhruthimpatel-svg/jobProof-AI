/* ============================================================
   JobProof AI — js/fileio.js
   File text extraction, entirely in the browser.
   PDF  → pdf.js (vendored, lib/pdf.min.js + worker)
   DOCX → mammoth (vendored, lib/mammoth.browser.min.js)
   TXT  → FileReader
   ============================================================ */

(function () {
  "use strict";

  var JP = window.JP;

  function fail(msg) {
    return Promise.reject({ userMessage: msg });
  }

  var JPFile = {
    accept: ".pdf,.docx,.txt,.md",

    extractFromFile: function (file) {
      if (!file) return fail("No file received. Please choose a file and try again.");

      var lower = (file.name || "").toLowerCase();
      var isPdf = file.type === "application/pdf" || /\.pdf$/.test(lower);
      var isDocx = /\.docx$/.test(lower) ||
        file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      var isTxt = file.type === "text/plain" || /\.(txt|md)$/i.test(lower);

      if (!isPdf && !isDocx && !isTxt) {
        return fail("That file type isn't supported. Please upload a PDF, DOCX, or TXT resume.");
      }

      /* Server-side extraction first (real backend). If the server is
         unreachable, fall back to the original in-browser readers so the
         app still works offline — same outputs either way. */
      if (window.JP && JP.api) {
        return JP.api.extractFile(file).then(function (res) {
          return { text: res.text, kind: res.kind, pages: null, serverExtracted: true };
        }).catch(function (err) {
          if (err && err.status && err.status === 422) throw err; // scanned PDF etc.
          return fallback(file, isPdf, isDocx, isTxt);
        });
      }
      return fallback(file, isPdf, isDocx, isTxt);

      function fallback(file, isPdf, isDocx, isTxt) {
        if (isPdf) return self_extractPdf(file);
        if (isDocx) return JPFile.extractDocx(file);
        return JPFile.extractTxt(file);
      }

      function self_extractPdf(file) { return JPFile.extractPdf(file); }
    },

    /* ---------------- PDF ---------------- */

    extractPdf: function (file) {
      var self = this;
      return new Promise(function (resolve, reject) {
        if (!window.pdfjsLib) {
          reject({ userMessage: "The PDF reader failed to load. Check your connection and reload the page." });
          return;
        }
        var reader = new FileReader();
        reader.onerror = function () {
          reject({ userMessage: "We couldn't read this file. Try re-saving or uploading it again." });
        };
        reader.onload = function () {
          var data = new Uint8Array(reader.result);
          pdfjsLib.GlobalWorkerOptions.workerSrc = "lib/pdf.worker.min.js";
          pdfjsLib.getDocument({ data: data }).promise.then(function (pdf) {
            var pages = [];
            var p = 1;
            var next = function () {
              if (p > pdf.numPages) {
                var text = pages.join("\n\n").trim();
                if (text.length < 40) {
                  reject({ userMessage: "We couldn't read this file. It may be a scanned or image-only PDF — try a PDF with selectable text, or upload a DOCX/TXT version." });
                  return;
                }
                resolve({ text: text, pages: pdf.numPages, kind: "pdf" });
                return;
              }
              pdf.getPage(p).then(function (page) {
                return page.getTextContent();
              }).then(function (content) {
                pages.push(self._pdfPageText(content));
                p++;
                next();
              }).catch(function () {
                reject({ userMessage: "We couldn't read this file. Try uploading a PDF or DOCX with selectable text." });
              });
            };
            next();
          }).catch(function () {
            reject({ userMessage: "We couldn't read this file. It may be corrupted or password-protected. Try re-saving it as a PDF or uploading a DOCX." });
          });
        };
        reader.readAsArrayBuffer(file);
      });
    },

    // Reassemble pdf.js text items into readable lines and paragraphs.
    _pdfPageText: function (content) {
      var items = content.items || [];
      var lines = [];
      var line = "";
      var lastY = null;

      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (!it.str) continue;
        var y = it.transform ? Math.round(it.transform[5]) : 0;
        if (lastY !== null && Math.abs(y - lastY) > 2) {
          lines.push(line.trim());
          line = "";
        }
        line += it.str;
        if (it.hasEOL) {
          lines.push(line.trim());
          line = "";
        }
        lastY = y;
      }
      if (line.trim()) lines.push(line.trim());

      // Merge a line into the previous one when it clearly continues it.
      var out = [];
      for (var j = 0; j < lines.length; j++) {
        var l = (lines[j] || "").replace(/\s+/g, " ").trim();
        if (!l) continue;
        var prev = out[out.length - 1];
        if (prev && /[a-z,;)]$/.test(prev) && /^[a-z]/.test(l) && !/^\s*[-•*\u2022]/.test(l)) {
          out[out.length - 1] = prev + " " + l;
        } else {
          out.push(l);
        }
      }
      return out.join("\n");
    },

    /* ---------------- DOCX ---------------- */

    extractDocx: function (file) {
      return new Promise(function (resolve, reject) {
        if (!window.mammoth) {
          reject({ userMessage: "The DOCX reader failed to load. Check your connection and reload the page." });
          return;
        }
        var reader = new FileReader();
        reader.onerror = function () {
          reject({ userMessage: "We couldn't read this file. Try re-saving or uploading it again." });
        };
        reader.onload = function () {
          try {
            mammoth.extractRawText({ arrayBuffer: reader.result }).then(function (result) {
              var text = (result.value || "").trim();
              if (text.length < 40) {
                reject({ userMessage: "We couldn't read this file. It may be empty or protected. Try a different resume file." });
                return;
              }
              resolve({ text: text, kind: "docx" });
            }).catch(function () {
              reject({ userMessage: "We couldn't read this file. Try uploading a PDF or DOCX with selectable text." });
            });
          } catch (e) {
            reject({ userMessage: "We couldn't read this file. Try uploading a PDF or DOCX with selectable text." });
          }
        };
        reader.readAsArrayBuffer(file);
      });
    },

    /* ---------------- TXT / MD ---------------- */

    extractTxt: function (file) {
      return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onerror = function () {
          reject({ userMessage: "We couldn't read this file. Try re-saving or uploading it again." });
        };
        reader.onload = function () {
          var text = String(reader.result || "").trim();
          if (text.length < 40) {
            reject({ userMessage: "This file looks empty. Please upload a resume with your actual content." });
            return;
          }
          resolve({ text: text, kind: "txt" });
        };
        reader.readAsText(file);
      });
    },
  };

  JP.file = JPFile;
})();
