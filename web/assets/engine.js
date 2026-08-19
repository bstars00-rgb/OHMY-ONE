/* ============================================================
 * OHMY ONE demo engine — permission engine + business logic + audit.
 * Returns STRUCTURED results ({kind, data}); render.js localizes them.
 * All values are computed from OHMY_DATA (deterministic). No DB, no network.
 * ============================================================ */
const OHMY = (function () {
  "use strict";
  const D = OHMY_DATA, PID = D.PERSONA_IDS;

  const ROLE_PERMS = {
    EMPLOYEE: ["HR_LEAVE_READ_SELF", "HR_LEAVE_CREATE_SELF"],
    TEAM_LEADER: ["HR_LEAVE_READ_SELF", "HR_LEAVE_CREATE_SELF", "HR_LEAVE_READ_TEAM", "APPROVAL_READ", "APPROVAL_APPROVE", "APPROVAL_REJECT"],
    FINANCE: ["HR_LEAVE_READ_SELF", "HR_LEAVE_CREATE_SELF", "FINANCE_REVENUE_READ", "FINANCE_EXPENSE_READ", "FINANCE_PNL_READ"],
    HR: ["HR_LEAVE_READ_SELF", "HR_LEAVE_CREATE_SELF", "HR_LEAVE_READ_TEAM", "HR_LEAVE_READ_ALL", "HR_EMPLOYEE_READ_ALL", "APPROVAL_READ", "APPROVAL_APPROVE", "APPROVAL_REJECT"],
    CEO: ["HR_LEAVE_READ_SELF", "HR_LEAVE_READ_ALL", "APPROVAL_READ", "FINANCE_REVENUE_READ", "FINANCE_EXPENSE_READ", "FINANCE_PNL_READ"],
    ADMIN: ["ADMIN_RBAC_MANAGE", "ADMIN_AUDIT_READ", "ADMIN_CONFIG"],
  };
  const PERSONAS = [PID.LUCY, PID.DAVID, PID.FIONA, PID.HANA, PID.E001, PID.JAKE];

  function emp(no) { return D.empByNo(no); }
  function perms(no) { return ROLE_PERMS[emp(no).role] || []; }
  function can(no, code) { return perms(no).indexOf(code) >= 0; }
  function approverOf(no) { return no === PID.LUCY ? PID.DAVID : PID.E001; }
  function entCodeOf(no) { return D.entOf(emp(no).entity); }

  // ---------- approvals + leave requests (mutable) ----------
  let seq = 1;
  const leaveReqs = [], approvals = [];
  function newLeave(no, type, date, days) {
    const id = "REQ-" + (seq++);
    leaveReqs.push({ id, requesterNo: no, type, date, days, status: "PENDING" });
    approvals.push({ id, requesterNo: no, approverNo: approverOf(no), type, date, days, status: "PENDING" });
    return id;
  }
  newLeave(PID.LUCY, "ANNUAL", "2026-08-20", 1);   // seed one pending for David

  // ---------- audit ----------
  const audit = []; let aSeq = 0;
  function writeAudit(no, action, tool, detail, ok) {
    aSeq++;
    audit.unshift({ id: "a" + String(aSeq).padStart(4, "0"), ts: new Date(), actorNo: no, actor: emp(no).name, action, tool: tool || "—", detail: detail || "", success: ok !== false });
  }

  const MONTHS = (function () { const a = []; for (let m = 1; m <= 12; m++) a.push("2026-" + String(m).padStart(2, "0")); return a; })();

  // result helpers
  function ok(no, tool, perm, action, kind, data, detail) { writeAudit(no, action, tool, detail, true); return { ok: true, tool, perm, risk: RISK[tool] || "READ", audit: action, kind, data }; }
  function deny(no, tool, need) { writeAudit(no, "PERMISSION_DENIED", tool, "missing " + need, false); return { ok: false, tool, need, risk: RISK[tool] || "READ", kind: "deny" }; }
  const RISK = { create_leave_request: "LOW_RISK_WRITE", approve_request: "APPROVAL", reject_request: "APPROVAL", change_salary: "CRITICAL" };

  function resolveEntity(no, args) { return (args && args.entity) || entCodeOf(no); }
  function resolvePersonaTag(tag) { const m = { CEO: PID.E001, LUCY: PID.LUCY, DAVID: PID.DAVID, FIONA: PID.FIONA, HANA: PID.HANA }; return m[tag]; }

  // pnl helper
  function pnl(entCode, period, isYear) {
    const src = isYear ? D.pnlAnnual[entCode][period] : D.pnlMonth[entCode][period];
    if (!src) return { revenue: 0, cogs: 0, gross: 0, opex: 0, op: 0, oi: 0, oe: 0, net: 0 };
    const gross = src.rev - src.cogs, op = gross - src.opex, net = op + src.oi - src.oe;
    return { revenue: src.rev, cogs: src.cogs, gross, opex: src.opex, op, oi: src.oi, oe: src.oe, net };
  }
  function netSeries(entCode) { return MONTHS.map(function (p) { const c = D.pnlMonth[entCode][p]; return c.rev - c.cogs - c.opex + c.oi - c.oe; }); }

  const API = {
    whoami: function (a) { const e = emp(a); return ok(a, "get_my_context", "self", "CONTEXT_VIEWED", "whoami", { no: e.no, name: e.name, role: e.role, dept: e.dept, entity: entCodeOf(a) }); },

    leaveBalance: function (a, args) {
      const t = (args && (args.targetNo || resolvePersonaTag(args.target))) || a;
      if (t !== a && !(can(a, "HR_LEAVE_READ_ALL") || (can(a, "HR_LEAVE_READ_TEAM") && approverOf(t) === a))) return deny(a, "get_leave_balance", "HR_LEAVE_READ_TEAM/ALL");
      const e = emp(t), l = e.leave[2026] || e.leave[2025];
      return ok(a, "get_leave_balance", "HR_LEAVE_READ_SELF", "LEAVE_BALANCE_VIEWED", "leaveBalance",
        { self: t === a, name: e.name, annual: { entitled: l.entitled, carried: 2, used: l.used, pending: l.pending || 0, remaining: l.entitled + 2 - l.used - (l.pending || 0) }, sick: { remaining: 10 } }, t);
    },

    createLeave: function (a) {
      const days = 1, date = "2026-08-20", type = "ANNUAL";
      const dup = leaveReqs.find(function (r) { return r.requesterNo === a && r.date === date && r.status !== "CANCELLED"; });
      if (dup) return ok(a, "create_leave_request", "HR_LEAVE_CREATE_SELF", "LEAVE_REQUEST_DUP", "createLeaveDup", { id: dup.id });
      const id = newLeave(a, type, date, days);
      return ok(a, "create_leave_request", "HR_LEAVE_CREATE_SELF", "LEAVE_REQUEST_CREATED", "createLeave",
        { id, type, date, days, approverNo: approverOf(a), approver: emp(approverOf(a)).name, approverRole: emp(approverOf(a)).role }, id);
    },

    leaveStatus: function (a) {
      const mine = leaveReqs.filter(function (r) { return r.requesterNo === a; });
      return ok(a, "get_leave_request_status", "self", "LEAVE_STATUS_VIEWED", "leaveStatus", { rows: mine.map(function (r) { return { type: r.type, date: r.date, days: r.days, status: r.status }; }) });
    },

    teamLeave: function (a) {
      if (!can(a, "HR_LEAVE_READ_TEAM") && !can(a, "HR_LEAVE_READ_ALL")) return deny(a, "get_team_leave_report", "HR_LEAVE_READ_TEAM");
      const rows = leaveReqs.filter(function (r) { return approverOf(r.requesterNo) === a || can(a, "HR_LEAVE_READ_ALL"); })
        .map(function (r) { return { name: emp(r.requesterNo).name, type: r.type, date: r.date, status: r.status }; });
      return ok(a, "get_team_leave_report", "HR_LEAVE_READ_TEAM", "LEAVE_TEAM_VIEWED", "teamLeave", { rows });
    },

    pending: function (a) {
      if (!can(a, "APPROVAL_APPROVE") && !can(a, "APPROVAL_READ")) return deny(a, "get_my_pending_approvals", "APPROVAL_APPROVE");
      const rows = approvals.filter(function (x) { return x.approverNo === a && x.status === "PENDING"; })
        .map(function (x) { return { id: x.id, requester: emp(x.requesterNo).name, type: x.type, date: x.date, days: x.days }; });
      return ok(a, "get_my_pending_approvals", can(a, "APPROVAL_APPROVE") ? "APPROVAL_APPROVE" : "APPROVAL_READ", "APPROVALS_VIEWED", "pending", { rows });
    },

    approve: function (a, id) {
      if (!can(a, "APPROVAL_APPROVE")) return deny(a, "approve_request", "APPROVAL_APPROVE");
      const ap = approvals.find(function (x) { return x.id === id; });
      if (!ap || ap.status !== "PENDING") return ok(a, "approve_request", "APPROVAL_APPROVE", "APPROVAL_NOOP", "note", { text: "noop" }, id);
      if (ap.approverNo !== a) return deny(a, "approve_request", "not the assigned approver (server-checked)");
      ap.status = "APPROVED"; const r = leaveReqs.find(function (x) { return x.id === id; }); r.status = "APPROVED";
      return ok(a, "approve_request", "APPROVAL_APPROVE", "LEAVE_REQUEST_APPROVED", "approve", { name: emp(ap.requesterNo).name, type: ap.type, date: ap.date }, id);
    },
    reject: function (a, id) {
      if (!can(a, "APPROVAL_REJECT")) return deny(a, "reject_request", "APPROVAL_REJECT");
      const ap = approvals.find(function (x) { return x.id === id; });
      if (!ap || ap.status !== "PENDING") return ok(a, "reject_request", "APPROVAL_REJECT", "APPROVAL_NOOP", "note", { text: "noop" }, id);
      if (ap.approverNo !== a) return deny(a, "reject_request", "not the assigned approver (server-checked)");
      ap.status = "REJECTED"; const r = leaveReqs.find(function (x) { return x.id === id; }); r.status = "REJECTED";
      return ok(a, "reject_request", "APPROVAL_REJECT", "LEAVE_REQUEST_REJECTED", "reject", { name: emp(ap.requesterNo).name }, id);
    },
    approveByName: function (a, targetNo) {
      const ap = approvals.find(function (x) { return x.requesterNo === targetNo && x.status === "PENDING"; });
      if (!ap) return ok(a, "approve_request", "APPROVAL_APPROVE", "APPROVAL_NOOP", "note", { text: "noPending" });
      return API.approve(a, ap.id);
    },

    // ---- finance ----
    revenue: function (a, args) {
      if (!can(a, "FINANCE_REVENUE_READ")) return deny(a, "get_monthly_revenue", "FINANCE_REVENUE_READ");
      const ent = resolveEntity(a, args), period = (args && args.period) || "2026-07";
      return ok(a, "get_monthly_revenue", "FINANCE_REVENUE_READ", "FINANCE_REPORT_VIEWED", "revenue", { entity: ent, period, revenue: pnl(ent, period, false).revenue });
    },
    pnlMonth: function (a, args) {
      if (!can(a, "FINANCE_PNL_READ")) return deny(a, "generate_income_statement", "FINANCE_PNL_READ");
      const ent = resolveEntity(a, args), period = (args && args.period) || "2026-08";
      return ok(a, "generate_income_statement", "FINANCE_PNL_READ", "FINANCE_REPORT_VIEWED", "pnl", { entity: ent, period, isYear: false, lines: pnl(ent, period, false), series: netSeries(ent) });
    },
    pnlYear: function (a, args) {
      if (!can(a, "FINANCE_PNL_READ")) return deny(a, "generate_income_statement", "FINANCE_PNL_READ");
      const ent = resolveEntity(a, args), year = (args && args.year) || 2025;
      return ok(a, "generate_income_statement", "FINANCE_PNL_READ", "FINANCE_REPORT_VIEWED", "pnl", { entity: ent, period: String(year), isYear: true, lines: pnl(ent, year, true) });
    },
    balanceSheet: function (a, args) {
      if (!can(a, "FINANCE_PNL_READ")) return deny(a, "generate_balance_sheet", "FINANCE_PNL_READ");
      const ent = resolveEntity(a, args), year = (args && args.year) || 2025;
      return ok(a, "generate_balance_sheet", "FINANCE_PNL_READ", "FINANCE_REPORT_VIEWED", "balanceSheet", { entity: ent, year, bs: D.balance[ent][year] });
    },
    compareProfit: function (a, args) {
      if (!can(a, "FINANCE_PNL_READ")) return deny(a, "compare_financial_periods", "FINANCE_PNL_READ");
      const ent = resolveEntity(a, args), cur = pnl(ent, "2026-08", false), prev = pnl(ent, "2026-07", false);
      return ok(a, "compare_financial_periods", "FINANCE_PNL_READ", "FINANCE_REPORT_VIEWED", "compare", { entity: ent, curP: "2026-08", prevP: "2026-07", curNet: cur.net, prevNet: prev.net, series: netSeries(ent) });
    },
    laborVsRevenue: function (a, args) {
      if (!can(a, "FINANCE_PNL_READ")) return deny(a, "labor_vs_revenue", "FINANCE_PNL_READ");
      const ent = resolveEntity(a, args);
      const rows = D.budgetVariance(ent, 2026).map(function (b) {
        const laborDelta = Math.round(b.actual * (b.dept === "CONTENT" ? 0.28 : 0.02));
        const revDelta = b.dept === "CONTENT" ? 0 : Math.round(b.actual * 0.05);
        return { deptKey: b.deptKey, laborDelta, revDelta, flagged: laborDelta > 0 && revDelta <= laborDelta };
      });
      return ok(a, "labor_vs_revenue", "FINANCE_PNL_READ", "FINANCE_REPORT_VIEWED", "laborVsRevenue", { rows });
    },
    entityRevenue: function (a, args) {
      if (!can(a, "FINANCE_PNL_READ")) return deny(a, "entity_revenue_compare", "FINANCE_PNL_READ");
      const year = (args && args.year) || 2025;
      return ok(a, "entity_revenue_compare", "FINANCE_PNL_READ", "FINANCE_REPORT_VIEWED", "entityRevenue", { year, rows: D.entityRevenue(year) });
    },
    arAging: function (a, args) {
      if (!can(a, "FINANCE_REVENUE_READ")) return deny(a, "get_ar_aging", "FINANCE_REVENUE_READ");
      const ent = resolveEntity(a, args);
      return ok(a, "get_ar_aging", "FINANCE_REVENUE_READ", "FINANCE_REPORT_VIEWED", "aging", { kind: "ar", entity: ent, rows: D.aging[ent].ar });
    },
    apAging: function (a, args) {
      if (!can(a, "FINANCE_EXPENSE_READ")) return deny(a, "get_ap_aging", "FINANCE_EXPENSE_READ");
      const ent = resolveEntity(a, args);
      return ok(a, "get_ap_aging", "FINANCE_EXPENSE_READ", "FINANCE_REPORT_VIEWED", "aging", { kind: "ap", entity: ent, rows: D.aging[ent].ap });
    },
    budgetVariance: function (a, args) {
      if (!can(a, "FINANCE_PNL_READ")) return deny(a, "get_budget_variance", "FINANCE_PNL_READ");
      const ent = resolveEntity(a, args);
      return ok(a, "get_budget_variance", "FINANCE_PNL_READ", "FINANCE_REPORT_VIEWED", "budgetVariance", { entity: ent, rows: D.budgetVariance(ent, 2026) });
    },

    // ---- HR analytics ----
    leaveUsage: function (a, args) {
      if (!can(a, "HR_LEAVE_READ_ALL")) return deny(a, "leave_usage_analysis", "HR_LEAVE_READ_ALL");
      const ent = (args && args.entity) || entCodeOf(a), year = (args && args.year) || 2025;
      return ok(a, "leave_usage_analysis", "HR_LEAVE_READ_ALL", "HR_REPORT_VIEWED", "leaveUsage", D.leaveUsage(ent, year));
    },
    headcount: function (a, args) {
      if (!can(a, "HR_LEAVE_READ_ALL")) return deny(a, "get_headcount", "HR_LEAVE_READ_ALL");
      return ok(a, "get_headcount", "HR_LEAVE_READ_ALL", "HR_REPORT_VIEWED", "headcount", { rows: D.headcount((args && args.entity) || null) });
    },
    compensation: function (a, args) {
      const t = (args && (args.targetNo || resolvePersonaTag(args.target))) || a;
      if (!can(a, "HR_EMPLOYEE_READ_ALL")) return deny(a, "get_employee_compensation", "HR_EMPLOYEE_READ_ALL");
      return ok(a, "get_employee_compensation", "HR_EMPLOYEE_READ_ALL", "COMPENSATION_VIEWED", "compensation", { name: emp(t).name, salary: emp(t).salary }, t);
    },
    changeSalary: function (a) { writeAudit(a, "CRITICAL_TOOL_BLOCKED", "change_salary", "critical tier", false); return { ok: false, blocked: true, tool: "change_salary", risk: "CRITICAL", kind: "blocked" }; },
  };

  function call(actor, intent, args) {
    if (intent === "approve") return API.approve(actor, args);
    if (intent === "reject") return API.reject(actor, args);
    if (intent === "approveByName") return API.approveByName(actor, args);
    const fn = API[intent];
    return fn ? fn(actor, args) : null;
  }

  // ---------- multilingual-ish intent router (free text) ----------
  function route(text) {
    const t = (text || "").toLowerCase();
    const has = function () { return [].every.call(arguments, function (w) { return t.indexOf(w) >= 0; }); };
    const any = function () { return [].some.call(arguments, function (w) { return t.indexOf(w) >= 0; }); };
    const yearM = /(2024|2025|2026)/.exec(t); const year = yearM ? parseInt(yearM[1], 10) : undefined;
    const entity = any("베트남", "vietnam", "việt", "越南", "ベトナム", "vn") ? "OMH_VN"
      : any("싱가포르", "singapore", "新加坡", "シンガ", "sg") ? "OMH_SG"
        : any("한국", "korea", "韩国", "韓国", "kr") ? "OMH_KR" : undefined;
    const nameNo = (function () {
      const map = { lucy: PID.LUCY, "루시": PID.LUCY, david: PID.DAVID, "데이비드": PID.DAVID, fiona: PID.FIONA, hana: PID.HANA, grace: PID.E001, ceo: PID.E001, "대표": PID.E001 };
      const m = /(lucy|루시|david|데이비드|fiona|hana|grace|ceo|대표)/i.exec(text); return m ? map[m[0].toLowerCase()] : null;
    })();

    if (any("급여", "연봉", "salary", "薪", "給与", "lương")) return { intent: "compensation", args: nameNo ? { targetNo: nameNo } : { target: "CEO" } };
    if (any("인건비", "labor", "人力", "人件費", "nhân sự") && any("매출", "revenue", "营收", "売上", "doanh thu")) return { intent: "laborVsRevenue" };
    if (any("재무상태표", "대차대조표", "balance sheet", "资产负债", "貸借", "cân đối")) return { intent: "balanceSheet", args: { year: year || 2025, entity } };
    if (any("법인별", "by entity", "各法人", "法人別", "pháp nhân") && any("인원", "headcount", "人数", "人員", "nhân sự")) return { intent: "headcount", args: {} };
    if (any("법인별", "by entity", "各法人", "法人別") && any("매출", "revenue", "营收", "売上")) return { intent: "entityRevenue", args: { year: year || 2025 } };
    if (any("연차", "leave", "phép", "年假", "有給", "휴가") && any("분석", "usage", "analysis", "分析", "phân tích")) return { intent: "leaveUsage", args: { entity: entity || "OMH_VN", year: year || 2025 } };
    if (any("연차", "leave", "phép", "年假", "有給") && any("남", "잔여", "remain", "còn", "剩", "残")) return { intent: "leaveBalance", args: nameNo ? { targetNo: nameNo } : null };
    if (any("연차", "휴가", "leave", "phép", "有給") && any("신청", "쓸", "take", "nghỉ", "请假", "取り")) return { intent: "createLeave" };
    if (any("승인") || any("approve", "duyệt", "审批", "承認")) { if (nameNo) return { intent: "approveByName", args: nameNo }; return { intent: "pending" }; }
    if (any("인원", "headcount", "人数", "人員", "nhân sự")) return { intent: "headcount", args: {} };
    if (any("매출채권", "ar aging", "应收", "売掛", "phải thu")) return { intent: "arAging", args: { entity } };
    if (any("매입채무", "ap aging", "应付", "買掛", "phải trả")) return { intent: "apAging", args: { entity } };
    if (any("예산", "budget", "预算", "予算", "ngân sách")) return { intent: "budgetVariance", args: { entity } };
    if (any("이익", "profit", "利润", "利益", "lợi nhuận") && any("왜", "why", "줄", "为何", "減", "giảm")) return { intent: "compareProfit" };
    if ((any("연간", "annual", "年度", "年間", "năm")) && any("손익", "p&l", "pnl", "income", "损益", "kết quả")) return { intent: "pnlYear", args: { year: year || 2025, entity } };
    if (any("손익", "p&l", "pnl", "income statement", "损益", "損益", "kết quả")) return { intent: "pnlMonth", args: { entity } };
    if (any("매출", "revenue", "营收", "売上", "doanh thu")) return { intent: "revenue", args: { entity } };
    if (any("누구", "whoami", "내 정보")) return { intent: "whoami" };
    return null;
  }

  return {
    PERSONAS: PERSONAS, emp: emp, perms: perms, can: can,
    call: call, route: route, audit: function () { return audit; }, approvals: function () { return approvals; },
  };
})();
