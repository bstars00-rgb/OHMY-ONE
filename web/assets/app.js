/* OHMY ONE demo — UI controller. Talks only to the OHMY engine (no network). */
(function () {
  "use strict";
  var root = document.documentElement;
  var reduce = matchMedia("(prefers-reduced-motion:reduce)").matches;
  var current = "E005";          // starting persona: Lucy (employee)
  var busy = false;

  var STAGES = [["user", "USER"], ["claude", "CLAUDE"], ["mcp", "MCP"], ["perm", "권한엔진"], ["sql", "SQL"], ["audit", "감사"]];
  var CHIPS = [
    ["HR", "내 연차 얼마나 남았어?"],
    ["HR", "내일 연차 쓸게."],
    ["APPROVAL", "내가 승인해야 할 것 보여줘."],
    ["FINANCE", "이번달 매출 알려줘."],
    ["FINANCE", "이번달 P&L 만들어줘."],
    ["EXEC", "지난달보다 이익이 왜 줄었어?"],
    ["EXEC", "인건비 늘고 매출 안 따라온 조직?"],
    ["HR", "CEO 급여 알려줘."],
  ];

  /* ---------- theme ---------- */
  document.getElementById("theme").addEventListener("click", function () {
    var cur = root.getAttribute("data-theme");
    var dark = cur ? cur === "dark" : matchMedia("(prefers-color-scheme:dark)").matches;
    root.setAttribute("data-theme", dark ? "light" : "dark");
  });

  /* ---------- tabs ---------- */
  var views = { chat: document.getElementById("view-chat"), audit: document.getElementById("view-audit"), arch: document.getElementById("view-arch") };
  [].forEach.call(document.querySelectorAll(".tab"), function (t) {
    t.addEventListener("click", function () {
      [].forEach.call(document.querySelectorAll(".tab"), function (x) { x.setAttribute("aria-selected", "false"); });
      t.setAttribute("aria-selected", "true");
      for (var k in views) views[k].classList.add("hidden");
      views[t.dataset.view].classList.remove("hidden");
      if (t.dataset.view === "audit") renderAudit();
    });
  });

  /* ---------- personas ---------- */
  var pc = document.getElementById("personas");
  OHMY.PERSONAS.forEach(function (no) {
    var e = OHMY.EMP[no];
    var b = document.createElement("button");
    b.className = "persona"; b.setAttribute("aria-pressed", no === current ? "true" : "false");
    b.innerHTML = '<span class="pn">' + e.name + '</span><span class="pr">' + e.roleKo + " · " + e.role + "</span>";
    b.addEventListener("click", function () {
      current = no;
      [].forEach.call(pc.children, function (c, i) { c.setAttribute("aria-pressed", OHMY.PERSONAS[i] === no ? "true" : "false"); });
      renderPerms(); renderApprovalsPanel();
    });
    pc.appendChild(b);
  });

  /* ---------- chips ---------- */
  var chipsEl = document.getElementById("chips");
  CHIPS.forEach(function (c) {
    var b = document.createElement("button");
    b.className = "chip"; b.innerHTML = '<span class="tag">' + c[0] + "</span>" + c[1];
    b.addEventListener("click", function () { submit(c[1], b); });
    chipsEl.appendChild(b);
  });

  /* ---------- ask input ---------- */
  var input = document.getElementById("ask");
  document.getElementById("send").addEventListener("click", function () { submit(input.value, null); });
  input.addEventListener("keydown", function (e) { if (e.key === "Enter") submit(input.value, null); });

  /* ---------- pipeline ---------- */
  var pipeEl = document.getElementById("pipe");
  function drawPipe(active, rejectAt) {
    pipeEl.innerHTML = "";
    STAGES.forEach(function (s, i) {
      var n = document.createElement("span"); n.className = "node";
      if (rejectAt != null && i === rejectAt) n.className += " rej";
      else if (i < active) n.className += " on";
      n.innerHTML = '<span class="i"></span>' + s[1];
      pipeEl.appendChild(n);
      if (i < STAGES.length - 1) { var a = document.createElement("span"); a.className = "arrow"; a.textContent = "›"; pipeEl.appendChild(a); }
    });
  }
  drawPipe(0, null);

  /* ---------- submit flow ---------- */
  function submit(text, chip) {
    if (busy || !text || !text.trim()) return;
    var routed = OHMY.route(text);
    if (!routed) {
      renderMsg(text, { ok: true, tool: "—", perm: "—", risk: "READ", audit: "—", html: "<p>요청을 이해하지 못했어요. 예: “내 연차 얼마나 남았어?”, “이번달 P&L 만들어줘”, “Lucy 연차 승인해줘”.</p>" }, "note");
      if (input) input.value = "";
      return;
    }
    busy = true; if (chip) chip.setAttribute("disabled", "");
    var res = OHMY.call(current, routed.tool, routed.args);
    var allowed = res && res.ok;
    var rejectStage = 3;
    var step = 0;
    (function tick() {
      if (allowed) {
        step++; drawPipe(step, null);
        if (step < STAGES.length) schedule(tick); else done();
      } else {
        step++;
        if (step < rejectStage) { drawPipe(step, null); schedule(tick); }
        else { drawPipe(rejectStage, rejectStage); schedule(function () { drawPipe(6, rejectStage); done(); }); }
      }
    })();
    function schedule(f) { if (reduce) f(); else setTimeout(f, 140); }
    function done() {
      renderMsg(text, res, res.blocked ? "crit" : (allowed ? "ok" : "deny"));
      renderPerms(); renderApprovalsPanel(); renderFeed();
      if (chip) chip.removeAttribute("disabled");
      if (input) input.value = "";
      busy = false;
    }
  }

  /* ---------- render a message ---------- */
  var outEl = document.getElementById("out");
  function renderMsg(q, res, kind) {
    var e = OHMY.EMP[current];
    var m = document.createElement("div");
    m.className = "msg" + (kind === "deny" ? " deny" : kind === "crit" ? " crit" : "");
    var head = '<div class="q"><b>' + e.name + "</b> · " + e.roleKo + " &nbsp;—&nbsp; “" + esc(q) + "”</div>";
    var prov;
    if (kind === "deny") {
      prov = '<div class="prov"><span>권한 <span class="no">' + esc(res.need || "") + ' ✗</span></span>' +
        "<span>감사 <b>PERMISSION_DENIED</b></span><span class=\"badge d\">거부 · 감사됨</span></div>";
    } else if (kind === "crit") {
      prov = '<div class="prov"><span>등급 <b>CRITICAL</b></span><span>감사 <b>CRITICAL_TOOL_BLOCKED</b></span>' +
        '<span class="badge d">차단됨</span></div>';
    } else {
      prov = '<div class="prov"><span>도구 <b>' + esc(res.tool) + "</b></span>" +
        "<span>권한 <span class=\"ok\">" + esc(res.perm) + " ✓</span></span>" +
        "<span>출처 <b>PostgreSQL</b></span><span>감사 <b>" + esc(res.audit || "—") + "</b></span>" +
        '<span class="badge ' + (kind === "note" ? "r" : "v") + '">' + (kind === "note" ? res.risk : "DB가 계산함") + "</span></div>";
    }
    m.innerHTML = head + '<div class="a">' + res.html + "</div>" + prov;
    if (outEl.firstChild && outEl.firstChild.className === "empty") outEl.innerHTML = "";
    outEl.insertBefore(m, outEl.firstChild);
  }

  /* approve/reject buttons (event delegation across the whole doc) */
  document.addEventListener("click", function (ev) {
    var t = ev.target;
    var idA = t.getAttribute && t.getAttribute("data-approve");
    var idR = t.getAttribute && t.getAttribute("data-reject");
    if (idA) { var r = OHMY.call(current, "approve", idA); renderMsg("승인 처리", r, r.ok ? "ok" : "deny"); afterAction(); }
    if (idR) { var r2 = OHMY.call(current, "reject", idR); renderMsg("반려 처리", r2, r2.ok ? "ok" : "deny"); afterAction(); }
  });
  function afterAction() { renderPerms(); renderApprovalsPanel(); renderFeed(); if (!views.audit.classList.contains("hidden")) renderAudit(); }

  /* ---------- system panel: permissions ---------- */
  function renderPerms() {
    var el = document.getElementById("perms"); var e = OHMY.EMP[current];
    var list = OHMY.perms(current).map(function (p) {
      var fin = p.indexOf("FINANCE") === 0;
      return '<span class="perm' + (fin ? " fin" : "") + '">' + p + "</span>";
    }).join("");
    el.innerHTML = '<div class="dim sm" style="margin-bottom:7px">' + e.name + " · " + e.roleKo + " · " + e.team + "</div>" +
      '<div class="permlist">' + list + "</div>";
  }

  /* ---------- system panel: approvals for current persona ---------- */
  function renderApprovalsPanel() {
    var el = document.getElementById("appr");
    var mine = OHMY.approvals().filter(function (x) { return x.approverNo === current && x.status === "PENDING"; });
    if (!OHMY.can(current, "APPROVAL_APPROVE")) { el.innerHTML = '<span class="dim sm">이 역할에는 결재 권한이 없습니다.</span>'; return; }
    if (!mine.length) { el.innerHTML = '<span class="dim sm">대기 중인 결재가 없습니다.</span>'; return; }
    el.innerHTML = mine.map(function (x) {
      return '<div class="ev"><span class="who">' + OHMY.EMP[x.requesterNo].name + "</span><span class=\"m\">" + x.summary + "</span>" +
        ' <button class="mini" data-approve="' + x.id + '">승인</button> <button class="mini ghost" data-reject="' + x.id + '">반려</button></div>';
    }).join("");
  }

  /* ---------- system panel: audit feed ---------- */
  function renderFeed() {
    var el = document.getElementById("feed");
    var rows = OHMY.audit().slice(0, 8).map(function (a) {
      return '<div class="ev' + (a.success ? "" : " fail") + '"><span class="a aname">' + a.action + "</span>" +
        '<span class="who">' + a.actor + "</span><span class=\"m\">" + hhmm(a.ts) + " · " + a.id + "</span></div>";
    }).join("");
    el.innerHTML = rows || '<span class="dim sm">아직 기록이 없습니다.</span>';
  }

  /* ---------- audit view (full) ---------- */
  function renderAudit() {
    var el = document.getElementById("audit-body");
    el.innerHTML = OHMY.audit().map(function (a) {
      return '<tr class="' + (a.success ? "" : "fail") + '"><td class="mono">' + a.id + "</td><td>" + hhmm(a.ts) +
        '</td><td class="mono"><span class="aname">' + a.action + "</span></td><td>" + a.actor + "</td>" +
        '<td class="mono dim">' + a.tool + "</td><td>" + (a.success ? '<span class="ok">✓</span>' : '<span class="no">✗</span>') + "</td></tr>";
    }).join("");
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function hhmm(d) { function p(n) { return (n < 10 ? "0" : "") + n; } return p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds()); }

  renderPerms(); renderApprovalsPanel(); renderFeed();
})();
