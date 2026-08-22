/* OHMY ONE demo engine — hotel-distribution domain.
 * Permission engine + decision-grade reports + audit. Structured output only. */
const OHMY = (function () {
  "use strict";
  const D = OHMY_DATA, PID = D.PERSONA_IDS;

  const ROLE_PERMS = {
    STAFF: ["HR_LEAVE_READ_SELF", "HR_LEAVE_CREATE_SELF"],
    OPS: ["HR_LEAVE_READ_SELF", "HR_LEAVE_CREATE_SELF", "HR_LEAVE_READ_TEAM", "APPROVAL_READ", "APPROVAL_APPROVE", "APPROVAL_REJECT", "OPS_READ"],
    SALES: ["HR_LEAVE_READ_SELF", "HR_LEAVE_CREATE_SELF", "OPS_READ", "SALES_READ"],
    SUPPLY: ["HR_LEAVE_READ_SELF", "HR_LEAVE_CREATE_SELF", "SUPPLY_READ", "OPS_READ"],
    FINANCE: ["HR_LEAVE_READ_SELF", "HR_LEAVE_CREATE_SELF", "FIN_SETTLEMENT_READ", "FIN_AR_READ", "FIN_PNL_READ", "APPROVAL_READ", "APPROVAL_APPROVE", "APPROVAL_REJECT"],
    HR: ["HR_LEAVE_READ_SELF", "HR_LEAVE_CREATE_SELF", "HR_LEAVE_READ_TEAM", "HR_LEAVE_READ_ALL", "HR_EMPLOYEE_READ_ALL", "APPROVAL_READ", "APPROVAL_APPROVE", "APPROVAL_REJECT"],
    CEO: ["HR_LEAVE_READ_SELF", "HR_LEAVE_READ_ALL", "APPROVAL_READ", "APPROVAL_APPROVE", "APPROVAL_REJECT", "OPS_READ", "SALES_READ", "SUPPLY_READ", "FIN_SETTLEMENT_READ", "FIN_AR_READ", "FIN_PNL_READ", "EXEC_READ"],
  };
  const PERSONAS = [PID.STAFF, PID.OPS, PID.GSM, PID.SCM, PID.FIN, PID.HR, PID.CEO];

  function emp(no) { return D.empByNo(no); }
  function perms(no) { return ROLE_PERMS[emp(no).role] || []; }
  function can(no, code) { return perms(no).indexOf(code) >= 0; }
  function approverOf(no) { return no === PID.STAFF ? PID.OPS : PID.CEO; }

  // ---- e-approval drafts (기안/전자결재), multi-step by amount ----
  let seq = 1; const drafts = [];
  function leaderOf(no) { return no === PID.OPS ? PID.CEO : PID.OPS; }   // step-1 team leader
  function routeApprovers(reqNo, amount) {
    let chain = [leaderOf(reqNo)];
    if (amount > 1000000) chain.push(PID.FIN);    // + finance
    if (amount > 5000000) chain.push(PID.CEO);    // + CEO
    chain = chain.filter(function (x, i) { return x !== reqNo && chain.indexOf(x) === i; });
    if (!chain.length) chain = [PID.CEO];
    return chain.map(function (a, i) { return { no: i + 1, approverNo: a, status: "PENDING" }; });
  }
  let docSeq = 1;
  function pad2(n) { return n < 10 ? "0" + n : "" + n; }
  function docNoGen() { const d = new Date(); return "" + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + "-" + (docSeq++); }
  function dueStr7() { const due = new Date(); due.setDate(due.getDate() + 7); return due.getFullYear() + "." + (due.getMonth() + 1) + "." + due.getDate(); }

  // Build an EDITABLE draft TEMPLATE (flat fields). The AI pre-fills it; the
  // user edits fields, picks CC and the approval line, then hits 상신하기.
  function buildTemplate(type, reqNo, amount, title) {
    const e = emp(reqNo);
    const tpl = { type: type, title: title || "", drafter: { name: e.name, dept: e.dept, role: e.role }, payee: "", account: "", amount: amount || 0, due: dueStr7(), details: "", attachment: "" };
    if (type === "EXPENSE") {
      tpl.payee = "OMH 협력사 (샘플)"; tpl.account = "신한 ***-***-****";
      tpl.details = "1. 정산 보고\n - 사전 수령: HKD 710 · TWD 4,776\n - 사용 금액: HKD 361 · TWD 5,870\n2. 정산 결과\n - 홍콩달러 반납: HKD 349 / 대만달러 반납: 없음\n3. 기타: 개인 현금/카드 사용분 지급 요청\n위 금액을 송금 요청하오니 결재 바랍니다.";
      tpl.attachment = "출장비용정산서_v3.xlsx";
    } else if (type === "TRIP") {
      tpl.details = "1. 출장지: 부산 (2박 3일)\n2. 목적: 파트너 미팅 및 현장 점검\n3. 예상 경비: 교통·숙박·식대 포함\n4. 동행: 없음";
      tpl.attachment = "출장계획서.pdf";
    } else if (type === "PURCHASE") {
      tpl.payee = "소프트웨어 벤더 (샘플)";
      tpl.details = "1. 품목: 채널 모니터링 도구 라이선스 (연간) x5\n2. 구매 사유: 채널 모니터링 자동화\n3. 견적 첨부 · 대체안 검토 완료";
      tpl.attachment = "견적서.pdf";
    } else if (type === "LEAVE") {
      tpl.details = "휴가종류: 연차\n기간: 2026-08-20 (1일)\n사유: 개인 사유"; tpl.amount = 0;
    } else {
      tpl.details = title ? title : "(내용을 입력하세요)";
    }
    return tpl;
  }
  // approver candidates = employees who can approve; cc candidates = the personas
  function approverCandidates() { return PERSONAS.filter(function (no) { return can(no, "APPROVAL_APPROVE"); }).map(function (no) { return { no: no, name: emp(no).name, role: emp(no).role }; }); }
  function ccCandidates() { return PERSONAS.map(function (no) { return { no: no, name: emp(no).name, role: emp(no).role }; }); }
  function suggestApprovers(reqNo, amount) { return routeApprovers(reqNo, amount || 0).map(function (s) { return s.approverNo; }); }

  function newDraftFinal(reqNo, payload) {
    const id = "DR-" + String(seq++).padStart(3, "0");
    const drafter = { name: emp(reqNo).name, dept: emp(reqNo).dept, role: emp(reqNo).role };
    const ccNames = (payload.cc || []).map(function (no) { return emp(no).name; }).join(", ");
    const rows = [];
    if (payload.payee) rows.push({ k: "fld_payee", v: payload.payee });
    if (payload.account) rows.push({ k: "fld_account", v: payload.account });
    rows.push({ k: "fld_amount", v: payload.amount || 0, money: true });
    if (payload.due) rows.push({ k: "fld_due", v: payload.due });
    const doc = { docNo: docNoGen(), type: payload.type, title: payload.title || "", drafter: drafter, recipient: ccNames || "-", rows: rows, details: (payload.details || "").split("\n"), attachment: payload.attachment || "" };
    const approverNos = (payload.approvers && payload.approvers.length ? payload.approvers : suggestApprovers(reqNo, payload.amount)).filter(function (x, i, a) { return x && a.indexOf(x) === i; });
    const steps = approverNos.map(function (no, i) { return { no: i + 1, approverNo: no, status: "PENDING" }; });
    const dr = { id: id, requesterNo: reqNo, type: payload.type, title: payload.title || "", amount: payload.amount || 0, days: payload.type === "LEAVE" ? 1 : 0, doc: doc, cc: payload.cc || [], steps: steps, currentStep: 1, status: "PENDING", createdAt: new Date() };
    drafts.push(dr);
    if (dr.type === "LEAVE") emp(reqNo).leave[2026].pending += 1;
    return dr;
  }
  function newDraft(reqNo, type, title, amount, days) {
    return newDraftFinal(reqNo, { type: type, title: title, amount: amount, payee: "", account: "", due: dueStr7(), details: buildTemplate(type, reqNo, amount, title).details, attachment: buildTemplate(type, reqNo, amount, title).attachment, cc: [], approvers: suggestApprovers(reqNo, amount) });
  }
  function currentApprover(dr) { const s = dr.steps.find(function (x) { return x.no === dr.currentStep; }); return s ? s.approverNo : null; }
  function applyDraftEffect(dr, fin) { if (dr.type === "LEAVE" && dr.days) { const l = emp(dr.requesterNo).leave[2026]; l.pending = Math.max(0, l.pending - dr.days); if (fin === "APPROVED") l.used += dr.days; } }
  newDraft(PID.STAFF, "LEAVE", "연차 1일 · 2026-08-20", 0, 1);   // seed one pending for the team leader
  const audit = []; let aSeq = 0;
  function writeAudit(no, action, tool, detail, ok) { aSeq++; audit.unshift({ id: "a" + String(aSeq).padStart(4, "0"), ts: new Date(), actorNo: no, actor: emp(no).name, action, tool: tool || "—", detail: detail || "", success: ok !== false }); }

  const RISK = { create_leave_request: "LOW_RISK_WRITE", submit_draft: "LOW_RISK_WRITE", approve_request: "APPROVAL", reject_request: "APPROVAL" };
  function ok(no, tool, perm, action, kind, data) { writeAudit(no, action, tool, "", true); return { ok: true, tool, perm, risk: RISK[tool] || "READ", audit: action, kind, data }; }
  function deny(no, tool, need) { writeAudit(no, "PERMISSION_DENIED", tool, "missing " + need, false); return { ok: false, tool, need, kind: "deny" }; }

  function sellerByName(q) { if (!q) return null; q = q.toLowerCase(); return D.sellers.find(function (s) { return s.name.toLowerCase().indexOf(q) >= 0; }); }

  const API = {
    whoami: function (a) { const e = emp(a); return ok(a, "get_my_context", "self", "CONTEXT_VIEWED", "whoami", { name: e.name, role: e.role, dept: e.dept, entity: e.entity }); },

    // ---------- FINANCE ----------
    settlement: function (a, args) {
      if (!can(a, "FIN_SETTLEMENT_READ")) return deny(a, "get_seller_settlement", "FIN_SETTLEMENT_READ");
      const s = (args && args.sellerCode && D.sellerByCode[args.sellerCode]) || (args && args.seller && sellerByName(args.seller)) || D.sellerRanking()[0];
      const nativeReceivable = Math.round(s.receivableUSD / D.FX_USD[s.ccy]);
      const overduePct = s.receivableUSD ? Math.round(s.overdueUSD / s.receivableUSD * 1000) / 10 : 0;
      return ok(a, "get_seller_settlement", "FIN_SETTLEMENT_READ", "SETTLEMENT_VIEWED", "settlement",
        { seller: s.name, ccy: s.ccy, cycle: s.cycle, items: s.bookings, gmvUSD: s.gmvUSD, paidUSD: s.paidUSD, receivableUSD: s.receivableUSD, overdueUSD: s.overdueUSD, overduePct: overduePct, nativeReceivable: nativeReceivable });
    },
    arAging: function (a) {
      if (!can(a, "FIN_AR_READ")) return deny(a, "get_ar_aging", "FIN_AR_READ");
      const r = D.arAging(); const total = r.buckets.b0_15 + r.buckets.b16_30 + r.buckets.b31_60 + r.buckets.b60p;
      return ok(a, "get_ar_aging", "FIN_AR_READ", "FINANCE_REPORT_VIEWED", "arAging", { buckets: r.buckets, total: total, over60: r.buckets.b60p, watch: r.watch.map(function (s) { return { seller: s.name, ccy: s.ccy, overdueUSD: s.overdueUSD, b60p: s.aging.b60p }; }) });
    },
    currencyExposure: function (a) {
      if (!can(a, "FIN_AR_READ")) return deny(a, "get_currency_exposure", "FIN_AR_READ");
      const rows = D.currencyExposure(); const total = rows.reduce(function (x, r) { return x + r.usd; }, 0);
      return ok(a, "get_currency_exposure", "FIN_AR_READ", "FINANCE_REPORT_VIEWED", "currencyExposure", { rows: rows, total: total, top: rows[0] });
    },
    revenueByEntity: function (a) {
      if (!can(a, "FIN_PNL_READ")) return deny(a, "get_revenue_by_entity", "FIN_PNL_READ");
      const rows = D.ENTITIES.map(function (e) { const es = D.sellers.filter(function (s) { return s.entity === e.code; }); const gmv = es.reduce(function (x, s) { return x + s.gmvUSD; }, 0); const net = es.reduce(function (x, s) { return x + s.netRevUSD; }, 0); return { entity: e.code, gmvUSD: gmv, netUSD: net, take: gmv ? net / gmv : 0, sellers: es.length }; }).sort(function (x, y) { return y.netUSD - x.netUSD; });
      return ok(a, "get_revenue_by_entity", "FIN_PNL_READ", "FINANCE_REPORT_VIEWED", "revenueByEntity", { rows: rows, top: rows[0], totalNet: rows.reduce(function (x, r) { return x + r.netUSD; }, 0) });
    },
    pnl: function (a, args) {
      if (!can(a, "FIN_PNL_READ")) return deny(a, "generate_income_statement", "FIN_PNL_READ");
      const ent = (args && args.entity) || emp(a).entity, year = (args && args.year) || 2025, s = D.pnlAnnual[ent][year];
      const gross = s.rev - s.cogs, op = gross - s.opex, net = op + s.oi - s.oe;
      return ok(a, "generate_income_statement", "FIN_PNL_READ", "FINANCE_REPORT_VIEWED", "pnl", { entity: ent, period: String(year), lines: { revenue: s.rev, cogs: s.cogs, gross: gross, opex: s.opex, op: op, oi: s.oi, oe: s.oe, net: net }, series: D.netSeries(ent) });
    },
    balanceSheet: function (a, args) {
      if (!can(a, "FIN_PNL_READ")) return deny(a, "generate_balance_sheet", "FIN_PNL_READ");
      const ent = (args && args.entity) || emp(a).entity, year = (args && args.year) || 2025;
      return ok(a, "generate_balance_sheet", "FIN_PNL_READ", "FINANCE_REPORT_VIEWED", "balanceSheet", { entity: ent, year: year, bs: D.balance[ent][year] });
    },

    // ---------- OPERATIONS ----------
    bookingDashboard: function (a) {
      if (!can(a, "OPS_READ")) return deny(a, "get_booking_dashboard", "OPS_READ");
      const b = D.bookings; return ok(a, "get_booking_dashboard", "OPS_READ", "OPS_REPORT_VIEWED", "bookingDashboard", { total: b.total, roomNights: b.roomNights, gmvUSD: b.gmvUSD, netUSD: b.netUSD, take: b.gmvUSD ? b.netUSD / b.gmvUSD : 0, cancelPct: b.cancelPct, status: b.status });
    },
    cancellation: function (a) {
      if (!can(a, "OPS_READ")) return deny(a, "get_cancellation_analysis", "OPS_READ");
      const rows = D.sellers.slice().sort(function (x, y) { return y.cancelPct - x.cancelPct; }).slice(0, 6).map(function (s) { return { seller: s.name, cancelPct: s.cancelPct, bookings: s.bookings }; });
      return ok(a, "get_cancellation_analysis", "OPS_READ", "OPS_REPORT_VIEWED", "cancellation", { overall: D.bookings.cancelPct, rows: rows, worst: rows[0] });
    },
    bookingsByCountry: function (a) {
      if (!can(a, "OPS_READ")) return deny(a, "get_bookings_by_country", "OPS_READ");
      return ok(a, "get_bookings_by_country", "OPS_READ", "OPS_REPORT_VIEWED", "bookingsByCountry", { rows: D.bookings.byCountry, top: D.bookings.byCountry[0] });
    },

    // ---------- SALES / GSM ----------
    sellerRanking: function (a) {
      if (!can(a, "SALES_READ")) return deny(a, "get_seller_ranking", "SALES_READ");
      const r = D.sellerRanking(); const grower = D.sellers.slice().sort(function (x, y) { return y.momPct - x.momPct; })[0];
      return ok(a, "get_seller_ranking", "SALES_READ", "SALES_REPORT_VIEWED", "sellerRanking", { rows: r.slice(0, 8).map(function (s) { return { seller: s.name, gmvUSD: s.gmvUSD, netUSD: s.netRevUSD, bookings: s.bookings, momPct: s.momPct }; }), top: r[0], grower: { seller: grower.name, momPct: grower.momPct } });
    },
    newSellers: function (a) {
      if (!can(a, "SALES_READ")) return deny(a, "get_new_sellers", "SALES_READ");
      const n = D.newSellers(); return ok(a, "get_new_sellers", "SALES_READ", "SALES_REPORT_VIEWED", "newSellers", { rows: n.slice(0, 8).map(function (s) { return { seller: s.name, live: s.live, entity: s.entity, gmvUSD: s.gmvUSD, bookings: s.bookings }; }), count: n.length });
    },
    concentration: function (a) {
      if (!can(a, "SALES_READ")) return deny(a, "get_concentration", "SALES_READ");
      const r = D.sellerRanking(); const total = r.reduce(function (x, s) { return x + s.gmvUSD; }, 0); const top5 = r.slice(0, 5).reduce(function (x, s) { return x + s.gmvUSD; }, 0);
      return ok(a, "get_concentration", "SALES_READ", "SALES_REPORT_VIEWED", "concentration", { top5Pct: Math.round(top5 / total * 1000) / 10, top: r.slice(0, 5).map(function (s) { return { seller: s.name, pct: Math.round(s.gmvUSD / total * 1000) / 10 }; }), total: total });
    },

    // ---------- SUPPLY / SCM ----------
    contractMix: function (a) {
      if (!can(a, "SUPPLY_READ")) return deny(a, "get_contract_mix", "SUPPLY_READ");
      const rows = D.bookings.byContract.slice().sort(function (x, y) { return y.take - x.take; });
      return ok(a, "get_contract_mix", "SUPPLY_READ", "SUPPLY_REPORT_VIEWED", "contractMix", { rows: rows, best: rows[0] });
    },

    // ---------- HR ----------
    leaveBalance: function (a, args) {
      const target = (args && args.targetNo) || a;
      if (target !== a && !can(a, "HR_LEAVE_READ_ALL") && !(can(a, "HR_LEAVE_READ_TEAM") && approverOf(target) === a)) return deny(a, "get_leave_balance", "HR_LEAVE_READ_TEAM/ALL");
      const e = emp(target), l = e.leave[2026]; return ok(a, "get_leave_balance", "HR_LEAVE_READ_SELF", "LEAVE_BALANCE_VIEWED", "leaveBalance", { self: target === a, name: e.name, entitled: l.entitled, carried: 2, used: l.used, pending: l.pending, remaining: l.entitled + 2 - l.used - l.pending });
    },
    // 기안 작성: AI가 편집 가능한 양식을 준비 (아직 상신 아님)
    prepareDraft: function (a, args) {
      const type = (args && args.type) || "GENERAL", amount = (args && args.amount) || 0, title = (args && args.title) || "";
      const tpl = buildTemplate(type, a, amount, title);
      return ok(a, "prepare_draft", "self", "DRAFT_DRAFTED", "draftForm", { type: type, tpl: tpl, suggested: suggestApprovers(a, amount), approvers: approverCandidates(), cc: ccCandidates() });
    },
    // 최종 상신: 사용자가 수정한 값 + 참조 + 결재선으로 실제 기안 생성
    submitFinal: function (a, payload) {
      if ((payload.type || "GENERAL") === "LEAVE") { const l = emp(a).leave[2026]; if (l.entitled + 2 - l.used - l.pending < 1) return deny(a, "submit_draft", "잔여 연차 부족"); }
      const dr = newDraftFinal(a, payload);
      const line = dr.steps.map(function (s) { return { name: emp(s.approverNo).name, role: emp(s.approverNo).role }; });
      return ok(a, "submit_draft", "self", "DRAFT_SUBMITTED", "draftSubmitted", { id: dr.id, type: dr.type, amount: dr.amount, doc: dr.doc, line: line });
    },
    createLeave: function (a) {
      const l = emp(a).leave[2026]; if (l.entitled + 2 - l.used - l.pending < 1) return deny(a, "submit_draft", "잔여 연차 부족");
      const dr = newDraft(a, "LEAVE", "연차 1일 · 2026-08-20", 0, 1);
      const line = dr.steps.map(function (s) { return { name: emp(s.approverNo).name, role: emp(s.approverNo).role }; });
      return ok(a, "create_leave_request", "self", "DRAFT_SUBMITTED", "draftSubmitted", { id: dr.id, type: "LEAVE", amount: 0, doc: dr.doc, line: line });
    },
    pending: function (a) {
      if (!can(a, "APPROVAL_APPROVE") && !can(a, "APPROVAL_READ")) return deny(a, "get_my_pending_approvals", "APPROVAL_APPROVE");
      const rows = drafts.filter(function (dr) { return dr.status === "PENDING" && currentApprover(dr) === a; }).map(function (dr) { return { id: dr.id, requester: emp(dr.requesterNo).name, type: dr.type, title: dr.title, amount: dr.amount, step: dr.currentStep, steps: dr.steps.length }; });
      return ok(a, "get_my_pending_approvals", can(a, "APPROVAL_APPROVE") ? "APPROVAL_APPROVE" : "APPROVAL_READ", "APPROVALS_VIEWED", "pending", { rows: rows });
    },
    approve: function (a, id) {
      if (!can(a, "APPROVAL_APPROVE")) return deny(a, "approve_request", "APPROVAL_APPROVE");
      const dr = drafts.find(function (x) { return x.id === id; }); if (!dr || dr.status !== "PENDING") return ok(a, "approve_request", "APPROVAL_APPROVE", "APPROVAL_NOOP", "note", { text: "noop" });
      if (currentApprover(dr) !== a) return deny(a, "approve_request", "not the current-step approver (server-checked)");
      dr.steps.find(function (s) { return s.no === dr.currentStep; }).status = "APPROVED";
      if (dr.currentStep < dr.steps.length) { dr.currentStep++; const nx = emp(currentApprover(dr)); return ok(a, "approve_request", "APPROVAL_APPROVE", "DRAFT_STEP_APPROVED", "approve", { title: dr.title, type: dr.type, final: false, next: nx.name, nextRole: nx.role, step: dr.currentStep, steps: dr.steps.length }); }
      dr.status = "APPROVED"; applyDraftEffect(dr, "APPROVED");
      return ok(a, "approve_request", "APPROVAL_APPROVE", "DRAFT_APPROVED", "approve", { title: dr.title, type: dr.type, final: true });
    },
    reject: function (a, id) {
      if (!can(a, "APPROVAL_REJECT")) return deny(a, "reject_request", "APPROVAL_REJECT");
      const dr = drafts.find(function (x) { return x.id === id; }); if (!dr || dr.status !== "PENDING") return ok(a, "reject_request", "APPROVAL_REJECT", "APPROVAL_NOOP", "note", { text: "noop" });
      if (currentApprover(dr) !== a) return deny(a, "reject_request", "not the current-step approver (server-checked)");
      dr.status = "REJECTED"; applyDraftEffect(dr, "REJECTED");
      return ok(a, "reject_request", "APPROVAL_REJECT", "DRAFT_REJECTED", "reject", { title: dr.title, type: dr.type });
    },
    leaveUsage: function (a, args) {
      if (!can(a, "HR_LEAVE_READ_ALL")) return deny(a, "leave_usage_analysis", "HR_LEAVE_READ_ALL");
      const ent = (args && args.entity) || emp(a).entity, year = (args && args.year) || 2025; return ok(a, "leave_usage_analysis", "HR_LEAVE_READ_ALL", "HR_REPORT_VIEWED", "leaveUsage", D.leaveUsage(ent, year));
    },
    headcount: function (a) { if (!can(a, "HR_LEAVE_READ_ALL")) return deny(a, "get_headcount", "HR_LEAVE_READ_ALL"); return ok(a, "get_headcount", "HR_LEAVE_READ_ALL", "HR_REPORT_VIEWED", "headcount", { rows: D.headcount(), total: D.employees.length }); },

    // ---------- EXEC ----------
    execSummary: function (a) {
      if (!can(a, "EXEC_READ")) return deny(a, "get_exec_summary", "EXEC_READ");
      const b = D.bookings, ar = D.arAging(); const over60 = ar.buckets.b60p; const r = D.sellerRanking(); const total = r.reduce(function (x, s) { return x + s.gmvUSD; }, 0); const top5 = r.slice(0, 5).reduce(function (x, s) { return x + s.gmvUSD; }, 0);
      return ok(a, "get_exec_summary", "EXEC_READ", "EXEC_REPORT_VIEWED", "execSummary", { gmvUSD: b.gmvUSD, netUSD: b.netUSD, take: b.netUSD / b.gmvUSD, bookings: b.total, cancelPct: b.cancelPct, over60: over60, top5Pct: Math.round(top5 / total * 1000) / 10, sellers: D.sellers.length });
    },
  };

  function call(actor, intent, args) {
    if (intent === "approve") return API.approve(actor, args);
    if (intent === "reject") return API.reject(actor, args);
    const fn = API[intent]; return fn ? fn(actor, args) : null;
  }

  function parseAmount(text) {
    var t = (text || "").replace(/,/g, ""); var m;
    if (m = /([0-9]+)\s*억/.exec(t)) return parseInt(m[1], 10) * 100000000;
    if (m = /([0-9]+)\s*천만/.exec(t)) return parseInt(m[1], 10) * 10000000;
    if (m = /([0-9]+)\s*백만/.exec(t)) return parseInt(m[1], 10) * 1000000;
    if (m = /([0-9]+)\s*만/.exec(t)) return parseInt(m[1], 10) * 10000;
    if (m = /([0-9]+)\s*원/.exec(t)) return parseInt(m[1], 10);
    if (m = /([0-9]{4,})/.exec(t)) return parseInt(m[1], 10);
    return 0;
  }

  function route(text) {
    const t = (text || "").toLowerCase();
    const any = function () { return [].some.call(arguments, function (w) { return t.indexOf(w) >= 0; }); };
    const yearM = /(2024|2025|2026)/.exec(t); const year = yearM ? parseInt(yearM[1], 10) : undefined;
    const entity = any("베트남", "vietnam", "越南", "ベトナム") ? "OMH_VN" : any("싱가포르", "singapore", "新加坡") ? "OMH_SG" : any("일본", "japan", "日本") ? "OMH_JP" : any("한국", "korea", "韓国", "韩国") ? "OMH_KR" : undefined;
    const seller = (function () { const m = /(agoda|trip\.com|trip|dida|traveloka|klook|rakuten|webbeds|hana|myrealtrip|gotadi|vietravel|lion)/i.exec(text); return m ? m[0] : null; })();

    if (any("정산", "settlement", "settle", "決済", "quyết toán")) return { intent: "settlement", args: seller ? { seller: seller } : null };
    if (any("미수", "연체", "aging", "receivable", "overdue", "延滞", "未収", "công nợ")) return { intent: "arAging" };
    if (any("통화", "currency", "환리스크", "外貨", "币种", "tiền tệ", "fx")) return { intent: "currencyExposure" };
    if (any("법인별", "by entity", "각 법인", "法人別", "마진", "margin") && any("매출", "revenue", "마진", "margin", "利益", "doanh thu")) return { intent: "revenueByEntity" };
    if (any("취소", "cancel", "キャンセル", "hủy", "取消")) return { intent: "cancellation" };
    if (any("국가별", "by country", "国別", "国家", "quốc gia")) return { intent: "bookingsByCountry" };
    if (any("예약", "booking", "予約", "预订", "đặt phòng") && !any("취소")) return { intent: "bookingDashboard" };
    if (any("랭킹", "ranking", "top seller", "채널 실적", "셀러 실적", "ランキング", "排名")) return { intent: "sellerRanking" };
    if (any("신규", "new seller", "onboard", "新規", "新增", "mới")) return { intent: "newSellers" };
    if (any("집중", "concentration", "리스크", "risk", "集中")) return { intent: "concentration" };
    if (any("계약", "contract", "契約", "合约", "hợp đồng")) return { intent: "contractMix" };
    if (any("경영", "exec", "요약", "summary", "経営", "总览", "tổng quan")) return { intent: "execSummary" };
    if (any("재무상태표", "대차대조표", "balance sheet", "貸借", "资产负债", "cân đối")) return { intent: "balanceSheet", args: { year: year || 2025, entity: entity } };
    if (any("손익", "p&l", "pnl", "income", "損益", "损益", "kết quả")) return { intent: "pnl", args: { year: year || 2025, entity: entity } };
    if (any("연차", "휴가", "leave", "有給", "年假", "phép") && any("분석", "usage", "分析", "phân tích")) return { intent: "leaveUsage", args: { entity: entity || "OMH_VN", year: year || 2025 } };
    if (any("기안", "상신", "품의", "올려", "결재", "draft", "proposal", "đề xuất", "起案", "稟議", "申请", "报批")) {
      var dtype = any("출장", "trip", "công tác", "出張", "出差") ? "TRIP" : any("경비", "지출", "expense", "chi phí", "経費", "费用") ? "EXPENSE" : any("구매", "purchase", "mua", "購入", "采购") ? "PURCHASE" : any("연차", "휴가", "leave", "有給", "年假", "phép") ? "LEAVE" : "GENERAL";
      return { intent: "prepareDraft", args: { type: dtype, amount: parseAmount(text), title: (text || "").trim().slice(0, 40) } };
    }
    if (any("연차", "leave", "有給", "phép") && any("남", "잔여", "remain", "còn", "残", "剩")) return { intent: "leaveBalance" };
    if (any("연차", "휴가", "leave", "有給") && any("신청", "쓸", "take", "nghỉ", "请")) return { intent: "createLeave" };
    if (any("승인") || any("approve", "duyệt", "承認", "审批")) return { intent: "pending" };
    if (any("인원", "headcount", "人数", "人員", "nhân sự")) return { intent: "headcount" };
    if (any("누구", "whoami", "내 정보")) return { intent: "whoami" };
    return null;
  }

  return { PERSONAS: PERSONAS, emp: emp, perms: perms, can: can, call: call, route: route, audit: function () { return audit; }, pendingDrafts: function (no) { return drafts.filter(function (dr) { return dr.status === "PENDING" && currentApprover(dr) === no; }); } };
})();
