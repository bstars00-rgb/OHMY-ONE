/* OHMY ONE demo — UI controller (i18n + personas + render). No network. */
(function () {
  "use strict";
  var root = document.documentElement;
  var reduce = matchMedia("(prefers-reduced-motion:reduce)").matches;
  var lang = "ko";
  var current = OHMY.PERSONAS[0]; // Lucy (employee)
  var busy = false;
  var t = I18N.t;

  /* ---- static-chrome localization ---- */
  function applyI18n() {
    document.querySelectorAll("[data-i18n]").forEach(function (el) { el.textContent = t(lang, el.getAttribute("data-i18n")); });
    document.querySelectorAll("[data-i18n-ph]").forEach(function (el) { el.setAttribute("placeholder", t(lang, el.getAttribute("data-i18n-ph"))); });
    document.documentElement.lang = lang;
  }

  /* ---- theme ---- */
  document.getElementById("theme").addEventListener("click", function () {
    var cur = root.getAttribute("data-theme");
    var dark = cur ? cur === "dark" : matchMedia("(prefers-color-scheme:dark)").matches;
    root.setAttribute("data-theme", dark ? "light" : "dark");
  });

  /* ---- language switcher ---- */
  var langEl = document.getElementById("langs");
  I18N.LANGS.forEach(function (L) {
    var b = document.createElement("button");
    b.className = "langbtn"; b.textContent = L[1]; b.setAttribute("aria-pressed", L[0] === lang ? "true" : "false");
    b.addEventListener("click", function () {
      lang = L[0];
      [].forEach.call(langEl.children, function (c, i) { c.setAttribute("aria-pressed", I18N.LANGS[i][0] === lang ? "true" : "false"); });
      applyI18n(); renderPersonas(); renderChips(); renderPerms(); renderApprovalsPanel(); renderFeed(); drawPipe(0, null);
      document.getElementById("out").innerHTML = '<div class="empty">' + t(lang, "empty") + "</div>";
      if (!views.audit.classList.contains("hidden")) renderAudit();
    });
    langEl.appendChild(b);
  });

  /* ---- tabs ---- */
  var views = { chat: document.getElementById("view-chat"), audit: document.getElementById("view-audit"), arch: document.getElementById("view-arch") };
  document.querySelectorAll(".tab").forEach(function (tb) {
    tb.addEventListener("click", function () {
      document.querySelectorAll(".tab").forEach(function (x) { x.setAttribute("aria-selected", "false"); });
      tb.setAttribute("aria-selected", "true");
      for (var k in views) views[k].classList.add("hidden");
      views[tb.dataset.view].classList.remove("hidden");
      if (tb.dataset.view === "audit") renderAudit();
    });
  });

  /* ---- personas ---- */
  var pc = document.getElementById("personas");
  function renderPersonas() {
    pc.innerHTML = "";
    OHMY.PERSONAS.forEach(function (no) {
      var e = OHMY.emp(no);
      var b = document.createElement("button");
      b.className = "persona"; b.setAttribute("aria-pressed", no === current ? "true" : "false");
      b.innerHTML = '<span class="pn">' + e.name + '</span><span class="pr">' + I18N.role(lang, e.role) + "</span>";
      b.addEventListener("click", function () {
        current = no;
        [].forEach.call(pc.children, function (c, i) { c.setAttribute("aria-pressed", OHMY.PERSONAS[i] === no ? "true" : "false"); });
        renderChips(); renderPerms(); renderApprovalsPanel();
      });
      pc.appendChild(b);
    });
  }

  /* ---- chips ---- */
  var chipsEl = document.getElementById("chips");
  function renderChips() {
    chipsEl.innerHTML = "";
    I18N.personaChips(OHMY.emp(current).role).forEach(function (c) {
      var b = document.createElement("button");
      b.className = "chip"; b.innerHTML = '<span class="tag">' + c.cat + "</span>" + I18N.chipLabel(lang, c.labelKey || c.intent);
      b.addEventListener("click", function () { runIntent(c.intent, c.args, b, I18N.chipLabel(lang, c.labelKey || c.intent)); });
      chipsEl.appendChild(b);
    });
  }

  /* ---- ask input ---- */
  var input = document.getElementById("ask");
  document.getElementById("send").addEventListener("click", function () { submitText(input.value); });
  input.addEventListener("keydown", function (e) { if (e.key === "Enter") submitText(input.value); });
  function submitText(text) {
    if (!text || !text.trim()) return;
    var r = OHMY.route(text);
    if (!r) { showNote(text, t(lang, "unrecognized")); input.value = ""; return; }
    runIntent(r.intent, r.args, null, text);
  }

  /* ---- pipeline ---- */
  var STAGES = ["p_user", "CLAUDE", "MCP", "p_perm", "SQL", "p_audit"];
  var pipeEl = document.getElementById("pipe");
  function stageLabel(s) { return s.charAt(0) === "p" && s.indexOf("_") > 0 ? t(lang, s) : s; }
  function drawPipe(active, rejectAt) {
    pipeEl.innerHTML = "";
    STAGES.forEach(function (s, i) {
      var n = document.createElement("span"); n.className = "node";
      if (rejectAt != null && i === rejectAt) n.className += " rej"; else if (i < active) n.className += " on";
      n.innerHTML = '<span class="i"></span>' + stageLabel(s);
      pipeEl.appendChild(n);
      if (i < STAGES.length - 1) { var a = document.createElement("span"); a.className = "arrow"; a.textContent = "›"; pipeEl.appendChild(a); }
    });
  }

  /* ---- run ---- */
  function runIntent(intent, args, chip, rawText) {
    if (busy) return;
    var res = OHMY.call(current, intent, args);
    if (!res) { showNote(rawText || intent, t(lang, "unrecognized")); return; }
    busy = true; if (chip) chip.setAttribute("disabled", "");
    var allowed = res.ok, rejectStage = 3, step = 0;
    (function tick() {
      if (allowed) { step++; drawPipe(step, null); if (step < STAGES.length) sc(tick); else fin(); }
      else { step++; if (step < rejectStage) { drawPipe(step, null); sc(tick); } else { drawPipe(rejectStage, rejectStage); sc(function () { drawPipe(6, rejectStage); fin(); }); } }
    })();
    function sc(f) { if (reduce) f(); else setTimeout(f, 130); }
    function fin() {
      var q = rawText || I18N.chipLabel(lang, intent);
      renderMsg(q, res);
      renderPerms(); renderApprovalsPanel(); renderFeed();
      if (chip) chip.removeAttribute("disabled"); if (input) input.value = ""; busy = false;
    }
  }

  /* ---- message render ---- */
  var outEl = document.getElementById("out");
  function showNote(q, text) {
    var m = document.createElement("div"); m.className = "msg";
    m.innerHTML = qhead(q) + '<div class="a"><p>' + esc(text) + "</p></div>";
    prepend(m);
  }
  function qhead(q) { var e = OHMY.emp(current); return '<div class="q"><b>' + esc(e.name) + "</b> · " + I18N.role(lang, e.role) + " &nbsp;—&nbsp; “" + esc(q) + "”</div>"; }
  function renderMsg(q, res) {
    var kind = res.blocked ? "crit" : (res.ok ? "ok" : "deny");
    var m = document.createElement("div"); m.className = "msg" + (kind === "deny" ? " deny" : kind === "crit" ? " crit" : "");
    var body = OHMY_RENDER.render(lang, res);
    var prov;
    if (kind === "deny") prov = '<div class="prov"><span>' + t(lang, "prov_perm") + ' <span class="no">' + esc(res.need) + ' ✗</span></span><span>' + t(lang, "prov_audit") + ' <b>PERMISSION_DENIED</b></span><span class="badge d">' + t(lang, "badge_denied") + "</span></div>";
    else if (kind === "crit") prov = '<div class="prov"><span>CRITICAL</span><span>' + t(lang, "prov_audit") + ' <b>CRITICAL_TOOL_BLOCKED</b></span><span class="badge d">' + t(lang, "badge_blocked") + "</span></div>";
    else prov = '<div class="prov"><span>' + t(lang, "prov_tool") + " <b>" + esc(res.tool) + "</b></span><span>" + t(lang, "prov_perm") + ' <span class="ok">' + esc(res.perm) + ' ✓</span></span><span>' + t(lang, "prov_source") + " <b>PostgreSQL</b></span><span>" + t(lang, "prov_audit") + " <b>" + esc(res.audit) + '</b></span><span class="badge v">' + t(lang, "badge_db") + "</span></div>";
    m.innerHTML = qhead(q) + '<div class="a">' + body + "</div>" + prov;
    prepend(m);
  }
  function prepend(m) { if (outEl.firstChild && outEl.firstChild.className === "empty") outEl.innerHTML = ""; outEl.insertBefore(m, outEl.firstChild); }

  /* approve/reject + draft-form delegation */
  document.addEventListener("click", function (ev) {
    var el = ev.target.closest && ev.target.closest("[data-approve],[data-reject],[data-add-approver],[data-del-approver],[data-submit-draft],[data-cancel-draft]");
    if (!el) return;
    var idA = el.getAttribute("data-approve"), idR = el.getAttribute("data-reject");
    if (idA != null) { renderMsg(t(lang, "approve"), OHMY.call(current, "approve", idA)); after(); return; }
    if (idR != null) { renderMsg(t(lang, "reject"), OHMY.call(current, "reject", idR)); after(); return; }
    if (el.hasAttribute("data-add-approver")) {
      var line = el.closest("td").querySelector("[data-appr-line]"), tmpl = line.querySelector(".appr-row");
      if (tmpl) { var clone = tmpl.cloneNode(true); var s = clone.querySelector("select"); if (s) s.selectedIndex = 0; line.appendChild(clone); renumber(line); }
      return;
    }
    if (el.hasAttribute("data-del-approver")) {
      var row = el.closest(".appr-row"), ln = row.parentNode;
      if (ln.querySelectorAll(".appr-row").length > 1) { row.remove(); renumber(ln); }
      return;
    }
    if (el.hasAttribute("data-cancel-draft")) { var m = el.closest(".msg"); if (m) m.remove(); return; }
    if (el.hasAttribute("data-submit-draft")) {
      var form = el.closest(".draft-form");
      if (form.getAttribute("data-submitted")) return;
      var res = OHMY.call(current, "submitFinal", collectForm(form));
      if (res && res.ok) {
        form.setAttribute("data-submitted", "1");
        [].forEach.call(form.querySelectorAll("input,textarea,select,button"), function (x) { x.disabled = true; });
        el.textContent = t(lang, "btn_submitted");
      }
      renderMsg(t(lang, "submit_done_q"), res); after();
      return;
    }
  });
  function renumber(line) { [].forEach.call(line.querySelectorAll(".appr-row .stepno"), function (s, i) { s.textContent = i + 1; }); }
  function collectForm(form) {
    var g = function (f) { var e = form.querySelector('[data-f="' + f + '"]'); return e ? e.value : ""; };
    var cc = [].filter.call(form.querySelectorAll('[data-f="cc"] option'), function (o) { return o.selected; }).map(function (o) { return o.value; });
    var approvers = [].map.call(form.querySelectorAll("[data-appr]"), function (s) { return s.value; }).filter(Boolean);
    return { type: form.getAttribute("data-type"), title: g("title"), payee: g("payee"), account: g("account"), amount: parseInt(g("amount") || "0", 10) || 0, due: g("due"), details: g("details"), attachment: g("attachment"), cc: cc, approvers: approvers };
  }
  function after() { renderPerms(); renderApprovalsPanel(); renderFeed(); if (!views.audit.classList.contains("hidden")) renderAudit(); }

  /* panels */
  function renderPerms() {
    var e = OHMY.emp(current);
    document.getElementById("perms").innerHTML = '<div class="dim sm" style="margin-bottom:7px">' + e.name + " · " + I18N.role(lang, e.role) + "</div><div class=\"permlist\">" +
      OHMY.perms(current).map(function (p) { return '<span class="perm' + (p.indexOf("FINANCE") === 0 ? " fin" : "") + '">' + p + "</span>"; }).join("") + "</div>";
  }
  function renderApprovalsPanel() {
    var el = document.getElementById("appr");
    if (!OHMY.can(current, "APPROVAL_APPROVE")) { el.innerHTML = '<span class="dim sm">' + t(lang, "no_perm_role") + "</span>"; return; }
    var mine = OHMY.pendingDrafts(current);
    if (!mine.length) { el.innerHTML = '<span class="dim sm">' + t(lang, "no_pending") + "</span>"; return; }
    el.innerHTML = mine.map(function (dr) {
      var amt = dr.amount ? " · ₩" + Number(dr.amount).toLocaleString("en-US") : "";
      return '<div class="ev"><span class="who">' + OHMY.emp(dr.requesterNo).name + '</span><span class="m">' + t(lang, "dt_" + dr.type) + amt + "</span> " +
        '<button class="mini" data-approve="' + dr.id + '">' + t(lang, "approve") + '</button> <button class="mini ghost" data-reject="' + dr.id + '">' + t(lang, "reject") + "</button></div>";
    }).join("");
  }
  function renderFeed() {
    document.getElementById("feed").innerHTML = OHMY.audit().slice(0, 8).map(function (a) {
      return '<div class="ev' + (a.success ? "" : " fail") + '"><span class="a aname">' + a.action + '</span><span class="who">' + a.actor + '</span><span class="m">' + hhmm(a.ts) + " · " + a.id + "</span></div>";
    }).join("") || '<span class="dim sm">—</span>';
  }
  function renderAudit() {
    document.getElementById("audit-body").innerHTML = OHMY.audit().map(function (a) {
      return '<tr class="' + (a.success ? "" : "fail") + '"><td class="mono">' + a.id + "</td><td>" + hhmm(a.ts) + '</td><td class="mono"><span class="aname">' + a.action + "</span></td><td>" + a.actor + '</td><td class="mono dim">' + a.tool + "</td><td>" + (a.success ? '<span class="ok">✓</span>' : '<span class="no">✗</span>') + "</td></tr>";
    }).join("");
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function hhmm(d) { function p(n) { return (n < 10 ? "0" : "") + n; } return p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds()); }

  /* init */
  applyI18n(); renderPersonas(); renderChips(); renderPerms(); renderApprovalsPanel(); renderFeed(); drawPipe(0, null);
  outEl.innerHTML = '<div class="empty">' + t(lang, "empty") + "</div>";
})();
