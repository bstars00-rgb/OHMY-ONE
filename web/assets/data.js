/* ============================================================
 * OHMY ONE demo — dataset modeled on the real ELLIS business:
 * a B2B hotel bedbank distributing inventory to OTA/agency SELLERS
 * across 4 legal entities. Figures are SYNTHETIC but in realistic
 * ranges (deterministic seed). No production data is embedded.
 * ============================================================ */
const OHMY_DATA = (function () {
  "use strict";
  function rng(seed) { let s = seed >>> 0; return function () { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; }
  const R = rng(20260819);
  const bt = function (a, b) { return a + Math.round((b - a) * R()); };
  const btf = function (a, b) { return a + (b - a) * R(); };

  // ---- entities (owner companies) ----
  const ENTITIES = [
    { code: "OMH_KR", owner: 110000 }, { code: "OMH_JP", owner: 120000 },
    { code: "OMH_VN", owner: 130000 }, { code: "OMH_SG", owner: 160000 },
  ];
  const CCYS = ["KRW", "JPY", "USD", "CNY", "VND"];
  // rough USD per 1 unit of currency (for USD-equivalent aggregation)
  const FX_USD = { KRW: 1 / 1390, JPY: 1 / 150, USD: 1, CNY: 1 / 7.2, VND: 1 / 25000 };

  // ---- sellers/channels (public brand names; synthetic metrics) ----
  // tier drives volume; each seller belongs to one owner entity + billing currency
  const SELLER_DEFS = [
    ["Agoda", "OMH_KR", "USD", "2022-01-01", "mega"],
    ["Trip.com", "OMH_KR", "USD", "2022-01-01", "mega"],
    ["DidaTravel", "OMH_SG", "USD", "2022-01-01", "mega"],
    ["Traveloka", "OMH_SG", "USD", "2022-01-01", "large"],
    ["Klook", "OMH_SG", "USD", "2025-09-12", "large"],
    ["Rakuten Travel Xchange", "OMH_JP", "JPY", "2025-09-08", "large"],
    ["Webbeds", "OMH_KR", "USD", "2024-08-12", "large"],
    ["Hana Tour Business", "OMH_KR", "KRW", "2024-10-14", "mid"],
    ["Myrealtrip", "OMH_KR", "KRW", "2024-03-15", "mid"],
    ["allmytour", "OMH_KR", "KRW", "2022-01-01", "mid"],
    ["Tripbtoz", "OMH_KR", "USD", "2024-11-22", "mid"],
    ["Hotelpass", "OMH_KR", "KRW", "2024-05-07", "mid"],
    ["Lion Travel", "OMH_KR", "USD", "2025-09-12", "mid"],
    ["Qiyouji Travel", "OMH_SG", "USD", "2024-01-26", "small"],
    ["HEYTRIP", "OMH_SG", "USD", "2023-10-19", "small"],
    ["Gotadi", "OMH_VN", "VND", "2026-04-20", "small"],
    ["Vietravel", "OMH_VN", "VND", "2026-05-07", "small"],
    ["Kake Travel", "OMH_SG", "USD", "2025-07-29", "small"],
    ["Stayzada", "OMH_KR", "KRW", "2023-08-08", "mid"],
    ["Tira Travel", "OMH_KR", "KRW", "2024-03-07", "small"],
  ];
  const TIER = {
    mega: { bk: [9000, 16000], take: [0.045, 0.065], cancel: [0.22, 0.34] },
    large: { bk: [2500, 6000], take: [0.05, 0.08], cancel: [0.25, 0.4] },
    mid: { bk: [700, 2200], take: [0.06, 0.09], cancel: [0.28, 0.46] },
    small: { bk: [80, 600], take: [0.06, 0.11], cancel: [0.3, 0.5] },
  };
  const ADR_USD = 118; // avg daily rate ~ per room-night (gross)
  const sellers = SELLER_DEFS.map(function (d, i) {
    const code = 200011 + i, tier = TIER[d[4]];
    const bookings = bt(tier.bk[0], tier.bk[1]);
    const los = 1.4 + btf(0, 0.9);            // length of stay
    const roomNights = Math.round(bookings * los);
    const gmvUSD = Math.round(roomNights * ADR_USD * btf(0.85, 1.15));
    const take = btf(tier.take[0], tier.take[1]);
    const netRevUSD = Math.round(gmvUSD * take);
    const cancel = btf(tier.cancel[0], tier.cancel[1]);
    const mom = btf(-0.12, 0.4);              // MoM growth
    // receivables: fraction of GMV still unsettled, split by aging
    const unsettled = Math.round(gmvUSD * btf(0.55, 0.95));
    const paid = Math.round(gmvUSD - unsettled);
    // small sellers & a couple of names carry more overdue (the story)
    const overdueBias = d[4] === "small" || d[0] === "Hana Tour Business" || d[0] === "Kake Travel" ? btf(0.18, 0.4) : btf(0, 0.12);
    const b60p = Math.round(unsettled * overdueBias * btf(0.4, 0.8));
    const b31_60 = Math.round(unsettled * overdueBias * btf(0.2, 0.5));
    const b16_30 = Math.round(unsettled * btf(0.1, 0.22));
    const b0_15 = Math.max(0, unsettled - b60p - b31_60 - b16_30);
    return {
      code: code, name: d[0], entity: d[1], ccy: d[2], live: d[3], tier: d[4],
      status: "Active", cycle: d[4] === "mega" ? "15D" : d[4] === "large" ? "15D" : "30D",
      bookings: bookings, roomNights: roomNights, gmvUSD: gmvUSD, take: take, netRevUSD: netRevUSD,
      cancelPct: cancel, momPct: mom,
      receivableUSD: unsettled, paidUSD: paid,
      aging: { b0_15: b0_15, b16_30: b16_30, b31_60: b31_60, b60p: b60p },
      overdueUSD: b31_60 + b60p,
    };
  });
  const sellerByCode = {}; sellers.forEach(function (s) { sellerByCode[s.code] = s; });

  // ---- booking aggregates (this month) ----
  const totalBookings = sellers.reduce(function (a, s) { return a + s.bookings; }, 0);
  const totalRoomNights = sellers.reduce(function (a, s) { return a + s.roomNights; }, 0);
  const totalGMV = sellers.reduce(function (a, s) { return a + s.gmvUSD; }, 0);
  const totalNet = sellers.reduce(function (a, s) { return a + s.netRevUSD; }, 0);
  const wCancel = sellers.reduce(function (a, s) { return a + s.cancelPct * s.bookings; }, 0) / totalBookings;
  const confirmed = Math.round(totalBookings * (1 - wCancel));
  const status = {
    Reserved: Math.round(confirmed * 0.62), Confirmed: Math.round(confirmed * 0.38),
    Cancelled: Math.round(totalBookings * wCancel * 0.7),
    "Cancelled(Replied)": Math.round(totalBookings * wCancel * 0.24),
    "No-show": Math.round(totalBookings * wCancel * 0.06),
  };
  const COUNTRY_MIX = [["Japan", 0.34], ["Korea", 0.27], ["Vietnam", 0.14], ["Taiwan", 0.09], ["Thailand", 0.08], ["Others", 0.08]];
  const byCountry = COUNTRY_MIX.map(function (c) { return { country: c[0], bookings: Math.round(totalBookings * c[1]), gmvUSD: Math.round(totalGMV * c[1]) }; });
  const CONTRACT_MIX = [["Exclusive Rate", 0.30, 0.082], ["Dynamic Rate", 0.52, 0.058], ["Shared Rate", 0.18, 0.049]];
  const byContract = CONTRACT_MIX.map(function (c) {
    const gmv = Math.round(totalGMV * c[1]);
    return { type: c[0], bookings: Math.round(totalBookings * c[1]), gmvUSD: gmv, take: c[2], netUSD: Math.round(gmv * c[2]) };
  });

  // ---- finance per entity (revenue = net margin from that entity's sellers) ----
  const YEARS = [2024, 2025, 2026];
  const pnlAnnual = {}, balance = {};
  ENTITIES.forEach(function (ent) {
    const entSellers = sellers.filter(function (s) { return s.entity === ent.code; });
    const monthlyNet = entSellers.reduce(function (a, s) { return a + s.netRevUSD; }, 0);
    pnlAnnual[ent.code] = {}; balance[ent.code] = {};
    let retained = Math.round(monthlyNet * 6);
    YEARS.forEach(function (y, yi) {
      const rev = Math.round(monthlyNet * 12 * Math.pow(1.14, yi - 2)); // net revenue (margin) annual
      const cogs = Math.round(rev * 0.10);   // platform/supply cost
      let opex = Math.round(rev * 0.62);
      if (ent.code === "OMH_KR" && y === 2026) opex = Math.round(opex * 1.05);
      const oi = Math.round(rev * 0.01), oe = Math.round(rev * 0.006);
      pnlAnnual[ent.code][y] = { rev: rev, cogs: cogs, opex: opex, oi: oi, oe: oe };
      const net = rev - cogs - opex + oi - oe; retained += net;
      const gmvEnt = entSellers.reduce(function (a, s) { return a + s.gmvUSD; }, 0) * 12;
      const cash = Math.round(rev * 0.6), ar = Math.round(gmvEnt * 0.09), fixed = Math.round(rev * 0.5), inv = 0;
      const totalA = cash + ar + inv + fixed;
      const capital = Math.round(rev * 0.4), ap = Math.round(gmvEnt * 0.07);
      const loans = Math.max(0, totalA - capital - retained - ap);
      balance[ent.code][y] = {
        assets: { cash: cash, ar: ar, inventory: inv, fixed: fixed, total: totalA },
        liabilities: { ap: ap, loans: loans, total: ap + loans },
        equity: { capital: capital, retained: retained, total: capital + retained },
      };
    });
  });
  function netSeries(entCode) {
    const p = pnlAnnual[entCode][2026]; const base = (p.rev - p.cogs - p.opex + p.oi - p.oe) / 12;
    const a = []; for (let m = 0; m < 12; m++) a.push(Math.round(base * (0.8 + 0.03 * m + 0.12 * Math.sin(m / 2)))); return a;
  }

  // ---- HR: employees by entity + leave ----
  const DEPTS = ["OP", "GSM", "SCM", "FIN", "HR", "IT"];
  const DEPT_NAMEKEY = { OP: "op", GSM: "gsm", SCM: "scm", FIN: "fin", HR: "hr", IT: "it", CEO: "ceo" };
  const NAMEPOOL = {
    OMH_KR: ["Grace Choi", "David Kim", "Lucy Park", "Fiona Lee", "Hana Seo", "Jake Yang", "Mina Jung", "Noah Han", "Olivia Yoon", "Peter Kang", "Rachel Baek", "Sam Oh", "Tina Moon", "Yuna Jang", "Ben Suh", "Amy Cho"],
    OMH_JP: ["Sato Yuki", "Tanaka Ren", "Suzuki Aoi", "Ito Haru", "Nakamura Sora", "Kobayashi Yui", "Yamamoto Kai", "Watanabe Mei"],
    OMH_VN: ["Nguyen An", "Tran Binh", "Le Chi", "Pham Dung", "Hoang Em", "Vu Giang", "Dang Ha", "Bui Hai", "Do Khanh", "Ngo Lan", "Ly Nam", "Ho Oanh"],
    OMH_SG: ["Wei Tan", "Jun Lim", "Mei Ng", "Kai Wong", "Xin Goh", "Ravi Kumar", "Siti Rahman", "Aiden Lee", "Chloe Teo", "Ethan Sim"],
  };
  const employees = []; let seq = 0;
  function addEmp(entity, name, dept, role) {
    seq++; const no = "E" + String(seq).padStart(3, "0");
    const leave = {}; YEARS.forEach(function (y) { const ent = 15 + bt(0, 5), used = Math.min(ent, bt(4, ent)); leave[y] = { entitled: ent, used: used, pending: 0 }; });
    employees.push({ no: no, name: name, entity: entity, dept: dept, role: role, leave: leave });
    return employees[employees.length - 1];
  }
  // fixed personas (KR HQ)
  const P = {};
  P.CEO = addEmp("OMH_KR", "Grace Choi", "CEO", "CEO");
  P.OPS = addEmp("OMH_KR", "David Kim", "OP", "OPS");         // 운영 리더 (also approver)
  P.STAFF = addEmp("OMH_KR", "Lucy Park", "OP", "STAFF");     // 사원
  P.FIN = addEmp("OMH_KR", "Fiona Lee", "FIN", "FINANCE");
  P.HR = addEmp("OMH_KR", "Hana Seo", "HR", "HR");
  P.GSM = addEmp("OMH_KR", "Yuna Jang", "GSM", "SALES");      // 세일즈
  P.SCM = addEmp("OMH_KR", "Ben Suh", "SCM", "SUPPLY");       // 공급
  const PERSONA_IDS = { CEO: P.CEO.no, OPS: P.OPS.no, STAFF: P.STAFF.no, FIN: P.FIN.no, HR: P.HR.no, GSM: P.GSM.no, SCM: P.SCM.no };
  // fill remaining population per entity
  ENTITIES.forEach(function (ent) {
    const pool = NAMEPOOL[ent.code]; const target = ent.code === "OMH_KR" ? 20 : ent.code === "OMH_VN" ? 12 : ent.code === "OMH_SG" ? 10 : 8;
    let n = 0;
    while (employees.filter(function (e) { return e.entity === ent.code; }).length < target && n < pool.length + target) {
      addEmp(ent.code, pool[n % pool.length] + (n >= pool.length ? " " + (Math.floor(n / pool.length) + 1) : ""), DEPTS[n % DEPTS.length], n % 8 === 0 ? "OPS" : "STAFF"); n++;
    }
  });
  P.STAFF.leave[2026] = { entitled: 15, used: 3, pending: 0 };

  function keyOf(code) { return code; }
  function empByNo(no) { return employees.find(function (e) { return e.no === no; }); }
  function usd(seller, native) { return native ? Math.round(seller.receivableUSD / FX_USD[seller.ccy]) : seller.receivableUSD; }

  // aggregates used by reports
  function arAging() {
    const buckets = { b0_15: 0, b16_30: 0, b31_60: 0, b60p: 0 };
    sellers.forEach(function (s) { buckets.b0_15 += s.aging.b0_15; buckets.b16_30 += s.aging.b16_30; buckets.b31_60 += s.aging.b31_60; buckets.b60p += s.aging.b60p; });
    const watch = sellers.filter(function (s) { return s.overdueUSD > 0; }).sort(function (a, b) { return b.overdueUSD - a.overdueUSD; }).slice(0, 5);
    return { buckets: buckets, watch: watch };
  }
  function currencyExposure() {
    const m = {}; CCYS.forEach(function (c) { m[c] = { usd: 0, native: 0 }; });
    sellers.forEach(function (s) { m[s.ccy].usd += s.receivableUSD; m[s.ccy].native += Math.round(s.receivableUSD / FX_USD[s.ccy]); });
    return CCYS.map(function (c) { return { ccy: c, usd: m[c].usd, native: m[c].native }; }).filter(function (x) { return x.usd > 0; }).sort(function (a, b) { return b.usd - a.usd; });
  }
  function sellerRanking() { return sellers.slice().sort(function (a, b) { return b.gmvUSD - a.gmvUSD; }); }
  function newSellers() { return sellers.filter(function (s) { return s.live >= "2025-01-01"; }).sort(function (a, b) { return a.live < b.live ? 1 : -1; }); }
  function leaveUsage(entCode, year) {
    const rows = DEPTS.map(function (d) {
      const es = employees.filter(function (e) { return e.entity === entCode && e.dept === d; });
      if (!es.length) return null; let ent = 0, used = 0;
      es.forEach(function (e) { const l = e.leave[year]; ent += l.entitled; used += l.used; });
      return { deptKey: DEPT_NAMEKEY[d], employees: es.length, entitled: ent, used: used, rate: ent ? Math.round(used / ent * 1000) / 10 : 0 };
    }).filter(Boolean);
    let te = 0, tu = 0, tc = 0; rows.forEach(function (r) { te += r.entitled; tu += r.used; tc += r.employees; });
    return { entity: entCode, year: year, rows: rows, total: { employees: tc, entitled: te, used: tu, rate: te ? Math.round(tu / te * 1000) / 10 : 0 } };
  }
  function headcount() {
    return ENTITIES.map(function (ent) {
      return { entity: ent.code, total: employees.filter(function (e) { return e.entity === ent.code; }).length };
    });
  }

  return {
    ENTITIES: ENTITIES, CCYS: CCYS, FX_USD: FX_USD, DEPT_NAMEKEY: DEPT_NAMEKEY, YEARS: YEARS,
    sellers: sellers, sellerByCode: sellerByCode, employees: employees, PERSONA_IDS: PERSONA_IDS,
    bookings: { total: totalBookings, roomNights: totalRoomNights, gmvUSD: totalGMV, netUSD: totalNet, cancelPct: wCancel, status: status, byCountry: byCountry, byContract: byContract },
    pnlAnnual: pnlAnnual, balance: balance, netSeries: netSeries,
    empByNo: empByNo, arAging: arAging, currencyExposure: currencyExposure, sellerRanking: sellerRanking, newSellers: newSellers,
    leaveUsage: leaveUsage, headcount: headcount,
  };
})();
