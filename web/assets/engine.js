/* ============================================================
 * OHMY ONE — in-browser demo engine (NO database).
 * Mirrors the real backend shape: permission engine + deterministic
 * business logic + append-only audit. Every value shown by the UI is
 * produced HERE, not typed into the answer — the same principle the real
 * system enforces in SQL. Numbers are representative sample data.
 * ============================================================ */
const OHMY = (function () {
  "use strict";

  // ---------- Reference: roles -> permission codes (from the seed) ----------
  const ROLE_PERMS = {
    EMPLOYEE: ["HR_LEAVE_READ_SELF", "HR_LEAVE_CREATE_SELF"],
    TEAM_LEADER: ["HR_LEAVE_READ_SELF", "HR_LEAVE_CREATE_SELF", "HR_LEAVE_READ_TEAM",
      "APPROVAL_READ", "APPROVAL_APPROVE", "APPROVAL_REJECT"],
    FINANCE: ["HR_LEAVE_READ_SELF", "HR_LEAVE_CREATE_SELF",
      "FINANCE_REVENUE_READ", "FINANCE_EXPENSE_READ", "FINANCE_PNL_READ"],
    HR: ["HR_LEAVE_READ_SELF", "HR_LEAVE_CREATE_SELF", "HR_LEAVE_READ_TEAM",
      "HR_LEAVE_READ_ALL", "HR_EMPLOYEE_READ_ALL", "APPROVAL_READ", "APPROVAL_APPROVE", "APPROVAL_REJECT"],
    CEO: ["HR_LEAVE_READ_SELF", "HR_LEAVE_READ_ALL", "APPROVAL_READ",
      "FINANCE_REVENUE_READ", "FINANCE_EXPENSE_READ", "FINANCE_PNL_READ"],
    ADMIN: ["ADMIN_RBAC_MANAGE", "ADMIN_AUDIT_READ", "ADMIN_CONFIG"],
  };

  // ---------- Reference: people (personas + one team) ----------
  const EMP = {
    E001: { no: "E001", name: "Grace Choi", role: "CEO", roleKo: "CEO", team: "CEO Office", approver: null, salary: 420000 },
    E004: { no: "E004", name: "David Kim", role: "TEAM_LEADER", roleKo: "팀장", team: "Operations 1", approver: "E001", salary: 110000 },
    E005: { no: "E005", name: "Lucy Park", role: "EMPLOYEE", roleKo: "사원", team: "Operations 1", approver: "E004", salary: 62000 },
    E024: { no: "E024", name: "Fiona Lee", role: "FINANCE", roleKo: "재무", team: "Finance", approver: "E001", salary: 115000 },
    E027: { no: "E027", name: "Hana Seo", role: "HR", roleKo: "인사", team: "HR", approver: "E001", salary: 108000 },
    E029: { no: "E029", name: "Jake Yang", role: "ADMIN", roleKo: "관리자", team: "IT", approver: "E001", salary: 112000 },
  };
  const PERSONAS = ["E005", "E004", "E024", "E027", "E001", "E029"];

  // ---------- Mutable state ----------
  const YEAR = 2026;
  const balances = {
    E001: mkBal(20, 4, 6), E004: mkBal(18, 3, 5), E005: mkBal(15, 2, 3),
    E024: mkBal(17, 2, 4), E027: mkBal(16, 2, 2), E029: mkBal(15, 1, 4),
  };
  function mkBal(ent, carry, used) {
    return { ANNUAL: { entitled: ent, carried: carry, used: used, pending: 0 }, SICK: { entitled: 10, carried: 0, used: 0, pending: 0 } };
  }
  function remaining(b) { return b.entitled + b.carried - b.used - b.pending; }

  let approvalSeq = 1;
  const leaveReqs = [];   // {id, requesterNo, type, dateLabel, days, status, approverNo}
  const approvals = [];   // {id, requesterNo, approverNo, summary, status}
  // seed one pending request: Lucy -> David
  seedLeave("E005", "ANNUAL", "2026-08-20", 1, "개인 사유");

  function seedLeave(no, type, dateLabel, days, reason) {
    const e = EMP[no];
    balances[no][type].pending += days;
    const id = "REQ-" + (approvalSeq++);
    leaveReqs.push({ id, requesterNo: no, type, dateLabel, days, status: "PENDING", approverNo: e.approver });
    approvals.push({ id, requesterNo: no, approverNo: e.approver, summary: type + " " + dateLabel + " (" + days + "일)", status: "PENDING" });
    return id;
  }

  // ---------- Finance: 12-month ledger-derived series (deterministic) ----------
  const MONTHS = ["2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02",
    "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"];
  const PNL = {};
  MONTHS.forEach(function (p, i) {
    const rev = Math.min(505000 + i * 10000, 585000);      // grows, then flattens
    const cogs = Math.round(rev * 0.30);
    let opex = 300000 + i * 1500;
    if (i === MONTHS.length - 1) opex += 20000;             // Content payroll jump (the story)
    PNL[p] = { rev, cogs, opex, oi: 2000, oe: 1000 };
  });
  function pnlOf(p) {
    const c = PNL[p] || { rev: 0, cogs: 0, opex: 0, oi: 0, oe: 0 };
    const gross = c.rev - c.cogs, op = gross - c.opex, net = op + c.oi - c.oe;
    return { period: p, revenue: c.rev, cogs: c.cogs, gross: gross, opex: c.opex, op: op, oi: c.oi, oe: c.oe, net: net };
  }
  const CUR = "2026-08", PREV = "2026-07";
  // per-department labor vs revenue for the cross-functional query
  const LABOR = [
    { dept: "Content", laborPrev: 40000, laborCur: 55000, revPrev: 130000, revCur: 130000 },
    { dept: "Operations", laborPrev: 60000, laborCur: 61500, revPrev: 210000, revCur: 214000 },
    { dept: "GSM", laborPrev: 30000, laborCur: 30500, revPrev: 90000, revCur: 93000 },
    { dept: "SCM", laborPrev: 25000, laborCur: 25500, revPrev: 70000, revCur: 72000 },
  ].map(function (d) {
    d.laborDelta = d.laborCur - d.laborPrev; d.revDelta = d.revCur - d.revPrev;
    d.flagged = d.laborDelta > 0 && d.revDelta <= d.laborDelta; return d;
  });

  // ---------- Audit (append-only) ----------
  const audit = [];
  let auditSeq = 0;
  function writeAudit(actorNo, action, tool, detail, success) {
    auditSeq++;
    audit.unshift({
      id: "a" + auditSeq.toString(16).padStart(4, "0"),
      ts: new Date(), actorNo: actorNo, actor: EMP[actorNo] ? EMP[actorNo].name : "?",
      action: action, tool: tool || "—", detail: detail || "", success: success !== false,
    });
  }

  // ---------- Permission helpers ----------
  function perms(no) { return ROLE_PERMS[EMP[no].role] || []; }
  function can(no, code) { return perms(no).indexOf(code) >= 0; }

  const usd = function (n) { return "$" + Number(n).toLocaleString("en-US"); };
  const fig = function (t) { return '<span class="fig">' + t + "</span>"; };

  // Risk tier per tool (mirrors the MCP gateway)
  const RISK = {
    get_leave_balance: "READ", get_leave_request_status: "READ", get_team_leave_report: "READ",
    get_my_pending_approvals: "READ", get_monthly_revenue: "READ", generate_income_statement: "READ",
    compare_financial_periods: "READ", labor_vs_revenue: "READ", get_employee_compensation: "READ",
    create_leave_request: "LOW_RISK_WRITE", approve_request: "APPROVAL", reject_request: "APPROVAL",
    change_salary: "CRITICAL",
  };

  function deny(actorNo, tool, need) {
    writeAudit(actorNo, "PERMISSION_DENIED", tool, "missing " + need, false);
    return {
      ok: false, tool: tool, need: need, risk: RISK[tool] || "READ",
      html: '<p><b>권한이 없어 거부되었습니다.</b> 이 역할(' + EMP[actorNo].roleKo +
        ')에는 <span class="no mono">' + need + "</span> 권한이 없습니다.</p>" +
        '<p class="dim sm">숫자를 지어내지 않습니다 — 요청은 권한 엔진에서 차단되고 감사 로그에 기록됩니다.</p>',
    };
  }
  function okr(actorNo, tool, permCode, auditAction, html, detail) {
    writeAudit(actorNo, auditAction, tool, detail || "", true);
    return { ok: true, tool: tool, perm: permCode, risk: RISK[tool] || "READ", audit: auditAction, html: html };
  }

  // ---------- Business logic (the "RPCs") ----------
  const API = {
    whoami: function (a) {
      const e = EMP[a];
      return okr(a, "get_my_context", "self", "CONTEXT_VIEWED",
        "<p>" + e.name + " · " + e.roleKo + " · " + e.team + "</p>", "");
    },

    leaveBalance: function (a, targetNo) {
      const t = targetNo || a;
      if (t !== a && !(can(a, "HR_LEAVE_READ_ALL") || (can(a, "HR_LEAVE_READ_TEAM") && EMP[t].approver === a)))
        return deny(a, "get_leave_balance", "HR_LEAVE_READ_TEAM/ALL");
      const b = balances[t], an = b.ANNUAL;
      const html = "<p>" + (t === a ? "" : EMP[t].name + " · ") + "연차(ANNUAL) 잔여 " + fig(remaining(an).toFixed(1) + "일") +
        " <span class='dim sm'>(부여 " + an.entitled + " + 이월 " + an.carried + " − 사용 " + an.used + " − 대기 " + an.pending + ")</span></p>" +
        "<p>병가(SICK) 잔여 " + fig(remaining(b.SICK).toFixed(1) + "일") + ".</p>";
      return okr(a, "get_leave_balance", "HR_LEAVE_READ_SELF", "LEAVE_BALANCE_VIEWED", html, t);
    },

    createLeave: function (a, args) {
      const type = args.type || "ANNUAL", days = args.days || 1, label = args.dateLabel || "내일";
      const b = balances[a][type];
      if (remaining(b) < days)
        return deny(a, "create_leave_request", "잔여 부족(요청 " + days + " > 잔여 " + remaining(b).toFixed(1) + ")");
      // duplicate guard (idempotency by requester+date)
      const dup = leaveReqs.find(function (r) { return r.requesterNo === a && r.dateLabel === (args.iso || label) && r.status !== "CANCELLED"; });
      if (dup) return okr(a, "create_leave_request", "HR_LEAVE_CREATE_SELF", "LEAVE_REQUEST_DUP",
        "<p>동일 신청이 이미 존재합니다(멱등 처리). 중복 생성되지 않았습니다.</p>", "dup");
      const id = seedLeave(a, type, args.iso || label, days, args.reason || "");
      const appr = EMP[a].approver ? EMP[EMP[a].approver].name + "(" + EMP[EMP[a].approver].roleKo + ")" : "상급자";
      const html = "<p>" + label + " " + type + " " + fig(days + "일") + " 신청이 접수되었습니다. <span class='chip-pill warn'>대기중</span></p>" +
        "<p>승인 경로: " + appr + " · 요청번호 <span class='mono'>" + id + "</span>. 잔여에서 " + days + "일이 예약(pending)되었습니다.</p>" +
        "<p class='dim sm'>멱등키가 함께 전송되어 재시도해도 중복 신청되지 않습니다.</p>";
      return okr(a, "create_leave_request", "HR_LEAVE_CREATE_SELF", "LEAVE_REQUEST_CREATED", html, id);
    },

    leaveStatus: function (a) {
      const mine = leaveReqs.filter(function (r) { return r.requesterNo === a; });
      if (!mine.length) return okr(a, "get_leave_request_status", "self", "LEAVE_STATUS_VIEWED", "<p>신청 내역이 없습니다.</p>", "");
      const rows = mine.map(function (r) {
        return "<p>• " + r.type + " " + r.dateLabel + " (" + r.days + "일) · " + statusPill(r.status) + "</p>";
      }).join("");
      return okr(a, "get_leave_request_status", "self", "LEAVE_STATUS_VIEWED", rows, "");
    },

    teamLeave: function (a) {
      if (!can(a, "HR_LEAVE_READ_TEAM") && !can(a, "HR_LEAVE_READ_ALL"))
        return deny(a, "get_team_leave_report", "HR_LEAVE_READ_TEAM");
      const team = leaveReqs.filter(function (r) { return EMP[r.requesterNo].approver === a || can(a, "HR_LEAVE_READ_ALL"); });
      if (!team.length) return okr(a, "get_team_leave_report", "HR_LEAVE_READ_TEAM", "LEAVE_TEAM_VIEWED", "<p>이번달 팀 연차 내역이 없습니다.</p>", "");
      const rows = team.map(function (r) { return "<p>• " + EMP[r.requesterNo].name + " · " + r.type + " " + r.dateLabel + " · " + statusPill(r.status) + "</p>"; }).join("");
      return okr(a, "get_team_leave_report", "HR_LEAVE_READ_TEAM", "LEAVE_TEAM_VIEWED", rows, "");
    },

    pending: function (a) {
      if (!can(a, "APPROVAL_APPROVE") && !can(a, "APPROVAL_READ")) return deny(a, "get_my_pending_approvals", "APPROVAL_APPROVE");
      const mine = approvals.filter(function (x) { return x.approverNo === a && x.status === "PENDING"; });
      if (!mine.length) return okr(a, "get_my_pending_approvals", "APPROVAL_READ", "APPROVALS_VIEWED", "<p>승인 대기 항목이 없습니다.</p>", "");
      const rows = mine.map(function (x) {
        return "<p>• " + EMP[x.requesterNo].name + " · " + x.summary + " · <span class='mono'>" + x.id + "</span> " +
          "<button class='mini' data-approve='" + x.id + "'>승인</button> <button class='mini ghost' data-reject='" + x.id + "'>반려</button></p>";
      }).join("");
      return okr(a, "get_my_pending_approvals", "APPROVAL_APPROVE", "APPROVALS_VIEWED",
        "<p>승인 대기 " + fig(mine.length + "건") + ":</p>" + rows, "");
    },

    approve: function (a, id) {
      if (!can(a, "APPROVAL_APPROVE")) return deny(a, "approve_request", "APPROVAL_APPROVE");
      const ap = approvals.find(function (x) { return x.id === id; });
      if (!ap) return okr(a, "approve_request", "APPROVAL_APPROVE", "APPROVAL_NOTFOUND", "<p>요청을 찾을 수 없습니다.</p>", id);
      if (ap.status !== "PENDING") return okr(a, "approve_request", "APPROVAL_APPROVE", "APPROVAL_NOOP", "<p>이미 처리된 요청입니다 (" + ap.status + ").</p>", id);
      // server-side authorization: current user MUST be the assigned approver
      if (ap.approverNo !== a) return deny(a, "approve_request", "이 요청의 승인자가 아님(서버 검증)");
      ap.status = "APPROVED";
      const req = leaveReqs.find(function (r) { return r.id === id; });
      req.status = "APPROVED";
      const b = balances[req.requesterNo][req.type];
      b.pending = Math.max(0, b.pending - req.days); b.used += req.days;   // pending -> used
      const html = "<p>" + EMP[req.requesterNo].name + "님의 " + req.type + " " + req.dateLabel + " 요청을 <b>승인</b>했습니다. " +
        "예약분 " + req.days + "일이 사용으로 확정되었습니다.</p>";
      return okr(a, "approve_request", "APPROVAL_APPROVE", "LEAVE_REQUEST_APPROVED", html, id);
    },

    reject: function (a, id) {
      if (!can(a, "APPROVAL_REJECT")) return deny(a, "reject_request", "APPROVAL_REJECT");
      const ap = approvals.find(function (x) { return x.id === id; });
      if (!ap || ap.status !== "PENDING") return okr(a, "reject_request", "APPROVAL_REJECT", "APPROVAL_NOOP", "<p>처리할 수 없는 요청입니다.</p>", id);
      if (ap.approverNo !== a) return deny(a, "reject_request", "이 요청의 승인자가 아님(서버 검증)");
      ap.status = "REJECTED";
      const req = leaveReqs.find(function (r) { return r.id === id; });
      req.status = "REJECTED";
      const b = balances[req.requesterNo][req.type];
      b.pending = Math.max(0, b.pending - req.days);   // release reservation
      return okr(a, "reject_request", "APPROVAL_REJECT", "LEAVE_REQUEST_REJECTED",
        "<p>" + EMP[req.requesterNo].name + "님의 요청을 <b>반려</b>했습니다. 예약분이 해제되었습니다.</p>", id);
    },

    revenue: function (a, period) {
      if (!can(a, "FINANCE_REVENUE_READ")) return deny(a, "get_monthly_revenue", "FINANCE_REVENUE_READ");
      const p = pnlOf(period || CUR);
      return okr(a, "get_monthly_revenue", "FINANCE_REVENUE_READ", "FINANCE_REPORT_VIEWED",
        "<p>" + p.period + " 매출은 " + fig(usd(p.revenue)) + " 입니다. <span class='dim sm'>(POSTED 원장 집계)</span></p>", "revenue");
    },

    pnl: function (a, period) {
      if (!can(a, "FINANCE_PNL_READ")) return deny(a, "generate_income_statement", "FINANCE_PNL_READ");
      const p = pnlOf(period || CUR);
      const rows = [["매출", p.revenue], ["매출원가(COGS)", p.cogs], ["매출총이익", p.gross, "sub"],
      ["판관비", p.opex], ["영업이익", p.op, "sub"], ["기타수익", p.oi], ["기타비용", p.oe], ["당기순이익", p.net, "tot"]];
      let t = '<table class="stmt">';
      rows.forEach(function (r) { t += '<tr class="' + (r[2] || "") + '"><td>' + r[0] + '</td><td class="n">' + usd(r[1]) + "</td></tr>"; });
      t += "</table>";
      return okr(a, "generate_income_statement", "FINANCE_PNL_READ", "FINANCE_REPORT_VIEWED",
        "<p>" + p.period + " 손익계산서 (USD, 원장에서 계산):</p>" + t + spark(), "pnl");
    },

    compare: function (a, cur, prev) {
      if (!can(a, "FINANCE_PNL_READ")) return deny(a, "compare_financial_periods", "FINANCE_PNL_READ");
      const c = pnlOf(cur || CUR), pv = pnlOf(prev || PREV), d = c.net - pv.net;
      const html = "<p>순이익: " + pv.period + " " + fig(usd(pv.net)) + " → " + c.period + " " + fig(usd(c.net)) +
        " (" + fig((d < 0 ? "−" : "+") + usd(Math.abs(d))) + ").</p>" +
        '<p class="interp"><b>Claude 해석:</b> 매출은 정체된 반면 Content 부문 인건비가 약 ' + fig("+" + usd(15000)) +
        " 증가한 것이 이익 감소의 주요 동인입니다. 위 숫자는 <b>DB가 계산</b>했고, 이 문장만 해석입니다.</p>" + spark();
      return okr(a, "compare_financial_periods", "FINANCE_PNL_READ", "FINANCE_REPORT_VIEWED", html, "compare");
    },

    laborVsRevenue: function (a) {
      if (!can(a, "FINANCE_PNL_READ")) return deny(a, "labor_vs_revenue", "FINANCE_PNL_READ");
      let t = '<table class="stmt"><tr class="sub"><td>부서</td><td class="n">인건비 Δ</td><td class="n">매출 Δ</td><td class="n">주의</td></tr>';
      LABOR.forEach(function (d) {
        t += "<tr><td>" + d.dept + '</td><td class="n">' + (d.laborDelta >= 0 ? "+" : "") + usd(d.laborDelta) +
          '</td><td class="n">' + (d.revDelta >= 0 ? "+" : "") + usd(d.revDelta) + '</td><td class="n">' +
          (d.flagged ? '<span class="no">⚑ 주의</span>' : "<span class='ok'>정상</span>") + "</td></tr>";
      });
      t += "</table>";
      return okr(a, "labor_vs_revenue", "FINANCE_PNL_READ", "FINANCE_REPORT_VIEWED",
        "<p>부서별 인건비 vs 매출 변화 (전월 대비):</p>" + t +
        "<p class='interp'><b>Claude 해석:</b> <b>Content</b> 부서가 인건비는 늘었으나 매출이 따라오지 못해 표시(⚑)되었습니다.</p>", "labor");
    },

    compensation: function (a, targetNo) {
      const t = targetNo || a;
      if (!can(a, "HR_EMPLOYEE_READ_ALL")) return deny(a, "get_employee_compensation", "HR_EMPLOYEE_READ_ALL");
      return okr(a, "get_employee_compensation", "HR_EMPLOYEE_READ_ALL", "COMPENSATION_VIEWED",
        "<p>" + EMP[t].name + " 기본급: " + fig(usd(EMP[t].salary)) + " <span class='dim sm'>(민감정보 · 접근 감사됨)</span></p>", t);
    },

    changeSalary: function (a) {
      writeAudit(a, "CRITICAL_TOOL_BLOCKED", "change_salary", "critical tier blocked", false);
      return {
        ok: false, tool: "change_salary", risk: "CRITICAL", blocked: true,
        html: "<p><b>차단됨 — CRITICAL 등급.</b> 급여 변경은 되돌릴 수 없는 작업으로 프로토타입에서 자동 실행되지 않습니다. " +
          "관리자 콘솔에서 이중 통제 하에 사람이 수행해야 합니다.</p>",
      };
    },
  };

  function statusPill(s) {
    const m = { PENDING: "warn", APPROVED: "ok2", REJECTED: "no2", CANCELLED: "dimpill" };
    const ko = { PENDING: "대기중", APPROVED: "승인됨", REJECTED: "반려됨", CANCELLED: "취소됨" };
    return '<span class="chip-pill ' + (m[s] || "") + '">' + (ko[s] || s) + "</span>";
  }

  // small inline sparkline of 12-month net profit
  function spark() {
    const nets = MONTHS.map(function (p) { return pnlOf(p).net; });
    const min = Math.min.apply(null, nets), max = Math.max.apply(null, nets);
    const w = 220, h = 40, n = nets.length;
    const pts = nets.map(function (v, i) {
      const x = (i / (n - 1)) * (w - 6) + 3;
      const y = h - 3 - ((v - min) / (max - min || 1)) * (h - 6);
      return x.toFixed(1) + "," + y.toFixed(1);
    });
    const last = pts[pts.length - 1].split(",");
    return '<div class="spark"><span class="dim sm">순이익 추이 (12개월)</span><br>' +
      '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" role="img" aria-label="순이익 추이">' +
      '<polyline fill="none" stroke="var(--accent)" stroke-width="1.6" points="' + pts.join(" ") + '"/>' +
      '<circle cx="' + last[0] + '" cy="' + last[1] + '" r="2.6" fill="var(--accent)"/></svg></div>';
  }

  // ---------- Intent router: free text -> business call ----------
  function route(text) {
    const t = (text || "").toLowerCase();
    const has = function () { return [].every.call(arguments, function (w) { return t.indexOf(w) >= 0; }); };
    const name = /(lucy|루시|grace|그레이스|david|데이비드|fiona|피오나|hana|하나|jake|제이크|ceo|대표)/i.exec(text);
    function nameToNo() {
      const map = { lucy: "E005", "루시": "E005", grace: "E001", "그레이스": "E001", ceo: "E001", "대표": "E001", david: "E004", "데이비드": "E004", fiona: "E024", "피오나": "E024", hana: "E027", "하나": "E027", jake: "E029", "제이크": "E029" };
      return name ? map[name[0].toLowerCase()] : null;
    }
    if (has("급여") || has("연봉") || has("salary")) return { tool: "compensation", args: nameToNo() };
    if (has("인건비") || has("labor")) return { tool: "laborVsRevenue" };
    if (has("연차") && (has("남") || has("잔여") || has("얼마"))) return { tool: "leaveBalance", args: nameToNo() };
    if ((has("연차") || has("휴가")) && (has("쓸") || has("쓸게") || has("신청") || has("낼"))) {
      const iso = t.indexOf("내일") >= 0 ? "2026-08-20" : t.indexOf("모레") >= 0 ? "2026-08-21" : "2026-08-20";
      const label = t.indexOf("모레") >= 0 ? "모레" : "내일";
      return { tool: "createLeave", args: { type: "ANNUAL", days: 1, dateLabel: label, iso: iso, reason: "" } };
    }
    if (has("연차") && (has("어떻게") || has("상태") || has("됐"))) return { tool: "leaveStatus" };
    if (has("팀") && has("연차")) return { tool: "teamLeave" };
    if (has("승인") && name) return { tool: "approveByName", args: nameToNo() };
    if (has("승인")) return { tool: "pending" };
    if (has("매출") || has("revenue")) return { tool: "revenue" };
    if (has("p&l") || has("pnl") || has("손익") || has("손익계산")) return { tool: "pnl" };
    if (has("이익") && (has("왜") || has("줄") || has("감소") || has("비교"))) return { tool: "compare" };
    if (has("급여변경") || has("연봉인상")) return { tool: "changeSalary" };
    if (has("누구") || has("내 정보") || has("whoami")) return { tool: "whoami" };
    return null;
  }

  function approveByName(actor, targetNo) {
    // resolve the pending approval for that requester assigned to the actor
    const ap = approvals.find(function (x) { return x.requesterNo === targetNo && x.status === "PENDING"; });
    if (!ap) return { ok: true, tool: "approve_request", perm: "APPROVAL_APPROVE", risk: "APPROVAL", audit: "APPROVAL_NOOP", html: "<p>해당 인원의 대기 중인 요청이 없습니다.</p>" };
    return API.approve(actor, ap.id);
  }

  // dispatch a routed intent
  function call(actor, tool, args) {
    switch (tool) {
      case "whoami": return API.whoami(actor);
      case "leaveBalance": return API.leaveBalance(actor, args);
      case "createLeave": return API.createLeave(actor, args || {});
      case "leaveStatus": return API.leaveStatus(actor);
      case "teamLeave": return API.teamLeave(actor);
      case "pending": return API.pending(actor);
      case "approve": return API.approve(actor, args);
      case "reject": return API.reject(actor, args);
      case "approveByName": return approveByName(actor, args);
      case "revenue": return API.revenue(actor, args);
      case "pnl": return API.pnl(actor, args);
      case "compare": return API.compare(actor);
      case "laborVsRevenue": return API.laborVsRevenue(actor);
      case "compensation": return API.compensation(actor, args);
      case "changeSalary": return API.changeSalary(actor);
      default: return null;
    }
  }

  return {
    EMP: EMP, PERSONAS: PERSONAS, ROLE_PERMS: ROLE_PERMS,
    perms: perms, can: can, route: route, call: call,
    audit: function () { return audit; },
    approvals: function () { return approvals; },
    balances: function () { return balances; },
    remaining: remaining,
  };
})();
