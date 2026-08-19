/* ============================================================
 * OHMY ONE demo — mock dataset (NO database).
 * Deterministic (seeded) so figures are stable across reloads.
 * 3 legal entities, ~70 employees, 3 fiscal years of finance,
 * balance sheets, and per-employee leave usage. Representative sample data.
 * ============================================================ */
const OHMY_DATA = (function () {
  "use strict";
  // simple deterministic PRNG (LCG)
  function makeRng(seed) { let s = seed >>> 0; return function () { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; }
  const rnd = makeRng(20260819);
  const pick = (arr, r) => arr[Math.floor(r * arr.length)];
  const between = (a, b, r) => a + Math.round((b - a) * r);

  const YEARS = [2024, 2025, 2026];
  const ENTITIES = [
    { code: "OMH_KR", key: "kr", scale: 1.0, growth: 0.08 },
    { code: "OMH_VN", key: "vn", scale: 0.55, growth: 0.16 },
    { code: "OMH_SG", key: "sg", scale: 0.40, growth: 0.10 },
  ];
  const DEPTS = ["OP", "CONTENT", "GSM", "SCM", "FIN", "HR", "IT"];

  // name pools per entity (romanized; illustrative)
  const NAMES = {
    kr: ["Grace Choi", "Henry Lim", "Ian Seo", "David Kim", "Lucy Park", "Mina Jung", "Noah Han",
      "Olivia Yoon", "Peter Kang", "Quinn Ryu", "Rachel Baek", "Sam Oh", "Tina Moon", "Uma Shin",
      "Victor Ko", "Wendy Nam", "Yuna Jang", "Zack Bae", "Amy Cho", "Ben Suh", "Cora Min", "Dan Woo",
      "Fiona Lee", "Gary Im", "Helen Ahn", "Hana Seo", "Ivy Ha", "Jake Yang", "Kelly Do", "Leo Seok"],
    vn: ["Nguyen An", "Tran Binh", "Le Chi", "Pham Dung", "Hoang Em", "Vu Giang", "Dang Ha", "Bui Hai",
      "Do Khanh", "Ngo Lan", "Duong Minh", "Ly Nam", "Ho Oanh", "Cao Phuc", "Mai Quyen", "Trinh Son",
      "Vo Thao", "Dinh Uyen", "Ta Viet", "Chu Xuan", "Luu Yen", "Phan Anh", "Ha Bao", "Ton Cuong", "Kieu Diep"],
    sg: ["Wei Tan", "Jun Lim", "Mei Ng", "Kai Wong", "Xin Goh", "Ravi Kumar", "Siti Rahman", "Aiden Lee",
      "Chloe Teo", "Ethan Sim", "Farah Ali", "Grace Ong", "Hafiz Yusof", "Iris Chua", "Jared Koh"],
  };
  const DEPT_NAMEKEY = { OP: "op", CONTENT: "content", GSM: "gsm", SCM: "scm", FIN: "fin", HR: "hr", IT: "it" };

  // ---------- employees ----------
  const employees = [];
  let seq = 0;
  function addEmp(entKey, name, dept, role, tenure, salary) {
    seq++;
    const no = "E" + String(seq).padStart(3, "0");
    const leave = {};
    YEARS.forEach(function (y) {
      const entitled = 15 + Math.min(tenure + (y - 2024), 5);
      const used = Math.min(entitled, between(4, entitled, rnd()));
      leave[y] = { entitled: entitled, used: used, pending: y === 2026 ? 0 : 0 };
    });
    employees.push({ no: no, name: name, entity: entKey, dept: dept, role: role, tenure: tenure, salary: salary, leave: leave });
    return employees[employees.length - 1];
  }

  // fixed personas first (KR) so demo scenarios stay stable
  const P = {};
  P.E001 = addEmp("kr", "Grace Choi", "CEO", "CEO", 8, 420000);
  P.E002 = addEmp("kr", "David Kim", "OP", "TEAM_LEADER", 6, 110000);
  P.E003 = addEmp("kr", "Lucy Park", "OP", "EMPLOYEE", 4, 62000);
  P.E004 = addEmp("kr", "Fiona Lee", "FIN", "FINANCE", 6, 115000);
  P.E005 = addEmp("kr", "Hana Seo", "HR", "HR", 6, 108000);
  P.E006 = addEmp("kr", "Jake Yang", "IT", "ADMIN", 6, 112000);
  // remember persona ids
  const PERSONA_IDS = { E001: P.E001.no, DAVID: P.E002.no, LUCY: P.E003.no, FIONA: P.E004.no, HANA: P.E005.no, JAKE: P.E006.no };

  // fill the rest of the population per entity
  ENTITIES.forEach(function (ent) {
    const pool = NAMES[ent.key];
    const target = ent.key === "kr" ? 30 : ent.key === "vn" ? 25 : 15;
    let i = ent.key === "kr" ? 6 : 0; // KR already has 6 personas
    let n = 0;
    while (employees.filter(function (e) { return e.entity === ent.key; }).length < target && n < pool.length + target) {
      const name = pool[(i + n) % pool.length] + (n >= pool.length ? " " + (Math.floor(n / pool.length) + 1) : "");
      const dept = DEPTS[(n * 3 + i) % DEPTS.length];
      const role = (n % 9 === 0) ? "TEAM_LEADER" : "EMPLOYEE";
      const tenure = between(1, 7, rnd());
      const salary = between(45000, 90000, rnd());
      addEmp(ent.key, name, dept, role, tenure, salary);
      n++;
    }
  });

  // give the fixed personas realistic 2026 balances (with one pending demo request)
  P.E003.leave[2026] = { entitled: 15, used: 3, pending: 0 };  // Lucy
  P.E002.leave[2026] = { entitled: 18, used: 5, pending: 0 };

  // ---------- finance: annual + monthly P&L per entity per year ----------
  const MONTHS_OF = function (y) { const a = []; for (let m = 1; m <= 12; m++) a.push(y + "-" + String(m).padStart(2, "0")); return a; };
  const pnlAnnual = {};   // pnlAnnual[entity][year] = {rev,cogs,opex,oi,oe}
  const pnlMonth = {};    // pnlMonth[entity][period] = {...}
  const balance = {};     // balance[entity][year] = {...}

  ENTITIES.forEach(function (ent) {
    pnlAnnual[ent.code] = {}; pnlMonth[ent.code] = {}; balance[ent.code] = {};
    let retained = Math.round(1200000 * ent.scale); // opening retained earnings
    YEARS.forEach(function (y, yi) {
      const baseRev = Math.round(6800000 * ent.scale * Math.pow(1 + ent.growth, yi));
      const cogs = Math.round(baseRev * 0.30);
      // opex rises slightly faster in 2026 for KR (the "labor up" story)
      let opex = Math.round(baseRev * 0.52);
      if (ent.key === "kr" && y === 2026) opex = Math.round(opex * 1.06);
      const oi = Math.round(baseRev * 0.004), oe = Math.round(baseRev * 0.002);
      pnlAnnual[ent.code][y] = { rev: baseRev, cogs: cogs, opex: opex, oi: oi, oe: oe };
      // monthly split (seasonal-ish)
      const months = MONTHS_OF(y);
      const weights = months.map(function (_, m) { return 0.7 + 0.03 * m + 0.15 * Math.sin(m / 2); });
      const wsum = weights.reduce(function (a, b) { return a + b; }, 0);
      months.forEach(function (p, m) {
        const f = weights[m] / wsum;
        pnlMonth[ent.code][p] = {
          rev: Math.round(baseRev * f), cogs: Math.round(cogs * f), opex: Math.round(opex * f),
          oi: Math.round(oi * f), oe: Math.round(oe * f),
        };
      });
      // balance sheet at year end
      const net = baseRev - cogs - opex + oi - oe;
      retained += net;
      const cash = Math.round(baseRev * 0.22);
      const ar = Math.round(baseRev * 0.11);
      const inventory = Math.round(cogs * 0.08);
      const fixed = Math.round(baseRev * 0.35);
      const totalAssets = cash + ar + inventory + fixed;
      const capital = Math.round(1000000 * ent.scale);
      const ap = Math.round(cogs * 0.10);
      const loans = Math.max(0, totalAssets - capital - retained - ap);
      balance[ent.code][y] = {
        assets: { cash: cash, ar: ar, inventory: inventory, fixed: fixed, total: totalAssets },
        liabilities: { ap: ap, loans: loans, total: ap + loans },
        equity: { capital: capital, retained: retained, total: capital + retained },
      };
    });
  });

  // ---------- AR / AP aging (current, for 2026) ----------
  const aging = {};
  ENTITIES.forEach(function (ent) {
    const r = pnlAnnual[ent.code][2026].rev;
    aging[ent.code] = {
      ar: [["0-30", Math.round(r * 0.06)], ["31-60", Math.round(r * 0.03)], ["61-90", Math.round(r * 0.015)], ["90+", Math.round(r * 0.008)]],
      ap: [["0-30", Math.round(r * 0.04)], ["31-60", Math.round(r * 0.02)], ["61-90", Math.round(r * 0.008)], ["90+", Math.round(r * 0.004)]],
    };
  });

  // ---------- per-department budget vs actual (2026, KR) ----------
  function budgetVariance(entCode, year) {
    return DEPTS.map(function (d) {
      const emps = employees.filter(function (e) { return entOf(e.entity) === entCode && e.dept === d; });
      const actual = emps.reduce(function (s, e) { return s + Math.round(e.salary / 12); }, 0);
      const budget = Math.round(actual * (0.9 + 0.25 * rnd()));
      return { dept: d, deptKey: DEPT_NAMEKEY[d], budget: budget, actual: actual, variance: budget - actual };
    });
  }

  // helpers
  function entOf(key) { const m = { kr: "OMH_KR", vn: "OMH_VN", sg: "OMH_SG" }; return m[key]; }
  function keyOfEnt(code) { const m = { OMH_KR: "kr", OMH_VN: "vn", OMH_SG: "sg" }; return m[code]; }
  function empByNo(no) { return employees.find(function (e) { return e.no === no; }); }

  // leave usage analysis: by department for an entity+year
  function leaveUsage(entCode, year) {
    const key = keyOfEnt(entCode);
    const rows = DEPTS.map(function (d) {
      const emps = employees.filter(function (e) { return e.entity === key && e.dept === d; });
      if (!emps.length) return null;
      let ent = 0, used = 0;
      emps.forEach(function (e) { const l = e.leave[year]; if (l) { ent += l.entitled; used += l.used; } });
      return { dept: d, deptKey: DEPT_NAMEKEY[d], employees: emps.length, entitled: ent, used: used, rate: ent ? Math.round((used / ent) * 1000) / 10 : 0 };
    }).filter(Boolean);
    let te = 0, tu = 0, tc = 0;
    rows.forEach(function (r) { te += r.entitled; tu += r.used; tc += r.employees; });
    return { entity: entCode, year: year, rows: rows, total: { employees: tc, entitled: te, used: tu, rate: te ? Math.round((tu / te) * 1000) / 10 : 0 } };
  }

  function headcount(entCode) {
    const list = entCode ? [entCode] : ENTITIES.map(function (e) { return e.code; });
    return list.map(function (code) {
      const key = keyOfEnt(code);
      const byDept = DEPTS.map(function (d) {
        return { dept: d, deptKey: DEPT_NAMEKEY[d], count: employees.filter(function (e) { return e.entity === key && e.dept === d; }).length };
      }).filter(function (x) { return x.count > 0; });
      return { entity: code, total: employees.filter(function (e) { return e.entity === key; }).length, byDept: byDept };
    });
  }

  function entityRevenue(year) {
    return ENTITIES.map(function (e) { return { entity: e.code, revenue: pnlAnnual[e.code][year].rev }; });
  }

  return {
    YEARS: YEARS, ENTITIES: ENTITIES, DEPTS: DEPTS, DEPT_NAMEKEY: DEPT_NAMEKEY,
    employees: employees, PERSONA_IDS: PERSONA_IDS,
    pnlAnnual: pnlAnnual, pnlMonth: pnlMonth, balance: balance, aging: aging,
    entOf: entOf, keyOfEnt: keyOfEnt, empByNo: empByNo,
    leaveUsage: leaveUsage, headcount: headcount, entityRevenue: entityRevenue, budgetVariance: budgetVariance,
  };
})();
