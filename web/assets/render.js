/* OHMY ONE demo — localized renderer: {kind,data} -> HTML (per language). */
const OHMY_RENDER = (function () {
  "use strict";
  const t = I18N.t;
  function usd(n) { return "$" + Number(n).toLocaleString("en-US"); }
  function fig(s) { return '<span class="fig">' + s + "</span>"; }
  function pill(lang, s) { const cls = { PENDING: "warn", APPROVED: "ok2", REJECTED: "no2", CANCELLED: "dimpill" }[s] || ""; return '<span class="chip-pill ' + cls + '">' + I18N.status(lang, s) + "</span>"; }
  function row(cells, cls) { return '<tr class="' + (cls || "") + '">' + cells.map(function (c, i) { return "<td" + (i ? ' class="n"' : "") + ">" + c + "</td>"; }).join("") + "</tr>"; }
  function table(rows) { return '<table class="stmt">' + rows.join("") + "</table>"; }

  function spark(series) {
    if (!series || !series.length) return "";
    const min = Math.min.apply(null, series), max = Math.max.apply(null, series), w = 220, h = 40, n = series.length;
    const pts = series.map(function (v, i) { const x = (i / (n - 1)) * (w - 6) + 3; const y = h - 3 - ((v - min) / (max - min || 1)) * (h - 6); return x.toFixed(1) + "," + y.toFixed(1); });
    const last = pts[pts.length - 1].split(",");
    return '<div class="spark"><svg viewBox="0 0 ' + w + " " + h + '" width="' + w + '" height="' + h + '" role="img"><polyline fill="none" stroke="var(--accent)" stroke-width="1.6" points="' + pts.join(" ") + '"/><circle cx="' + last[0] + '" cy="' + last[1] + '" r="2.6" fill="var(--accent)"/></svg></div>';
  }

  function render(lang, res) {
    const d = res.data || {}, k = res.kind;
    switch (k) {
      case "deny": return "<p><b>" + t(lang, "denied", { perm: '<span class="no mono">' + (res.need || "") + "</span>" }) + "</b></p><p class='dim sm'>" + t(lang, "denied_note") + "</p>";
      case "blocked": return "<p><b>" + t(lang, "blocked_note") + "</b></p>";
      case "note": {
        if (d.text === "noPending") return "<p>" + t(lang, "no_pending") + "</p>";
        return "<p>—</p>";
      }
      case "whoami": return "<p>" + d.name + " · " + I18N.role(lang, d.role) + " · " + I18N.dept(lang, OHMY_DATA.DEPT_NAMEKEY[d.dept]) + " · " + I18N.ent(lang, d.entity) + "</p>";
      case "leaveBalance": {
        const a = d.annual;
        return "<p>" + (d.self ? "" : d.name + " · ") + t(lang, "r_annual") + " " + fig(a.remaining.toFixed(1) + t(lang, "r_days")) +
          " <span class='dim sm'>(" + t(lang, "r_of", { e: a.entitled, c: a.carried, u: a.used, p: a.pending }) + ")</span></p>" +
          "<p>" + t(lang, "r_sick") + " " + fig(d.sick.remaining.toFixed(1) + t(lang, "r_days")) + "</p>";
      }
      case "createLeave":
        return "<p>" + t(lang, "r_created", { date: d.date, type: t(lang, "r_annual"), days: d.days }) + " " + pill(lang, "PENDING") + "</p>" +
          "<p>" + t(lang, "r_approver") + ": " + d.approver + " (" + I18N.role(lang, d.approverRole) + ") · <span class='mono'>" + d.id + "</span></p>" +
          "<p class='dim sm'>" + t(lang, "r_reserved", { days: d.days }) + "</p>";
      case "createLeaveDup": return "<p>" + t(lang, "r_reserved", { days: 1 }) + " <span class='mono'>" + d.id + "</span></p>";
      case "leaveStatus":
        return d.rows.length ? d.rows.map(function (r) { return "<p>• " + t(lang, "r_annual") + " " + r.date + " (" + r.days + t(lang, "r_days") + ") · " + pill(lang, r.status) + "</p>"; }).join("") : "<p>—</p>";
      case "teamLeave":
        return "<p><b>" + t(lang, "tl_title") + "</b></p>" + (d.rows.length ? d.rows.map(function (r) { return "<p>• " + r.name + " · " + r.date + " · " + pill(lang, r.status) + "</p>"; }).join("") : "<p>—</p>");
      case "pending":
        return d.rows.length ? "<p>" + t(lang, "r_pending_n", { n: d.rows.length }) + "</p>" + d.rows.map(function (r) {
          return "<p>• " + r.requester + " · " + t(lang, "r_annual") + " " + r.date + " (" + r.days + t(lang, "r_days") + ") · <span class='mono'>" + r.id + "</span> " +
            '<button class="mini" data-approve="' + r.id + '">' + t(lang, "approve") + '</button> <button class="mini ghost" data-reject="' + r.id + '">' + t(lang, "reject") + "</button></p>";
        }).join("") : "<p>" + t(lang, "no_pending") + "</p>";
      case "approve": return "<p>" + t(lang, "r_approved_msg", { name: d.name, type: t(lang, "r_annual"), date: d.date }) + "</p>";
      case "reject": return "<p>" + t(lang, "r_rejected_msg", { name: d.name }) + "</p>";
      case "revenue": return "<p>" + t(lang, "r_revenue", { period: d.period, entity: I18N.ent(lang, d.entity), v: fig(usd(d.revenue)) }) + " <span class='dim sm'>" + t(lang, "ledgerNote") + "</span></p>";
      case "pnl": {
        const l = d.lines;
        const rows = [
          row([t(lang, "l_revenue"), usd(l.revenue)]), row([t(lang, "l_cogs"), usd(l.cogs)]),
          row([t(lang, "l_gross"), usd(l.gross)], "sub"), row([t(lang, "l_opex"), usd(l.opex)]),
          row([t(lang, "l_op"), usd(l.op)], "sub"), row([t(lang, "l_oi"), usd(l.oi)]),
          row([t(lang, "l_oe"), usd(l.oe)]), row([t(lang, "l_net"), usd(l.net)], "tot"),
        ];
        const title = I18N.ent(lang, d.entity) + " " + d.period + " " + t(lang, "incomeStatement");
        return "<p>" + title + " (USD)</p>" + table(rows) + (d.series ? "<div class='dim sm' style='margin-top:6px'>" + t(lang, "netTrend") + "</div>" + spark(d.series) : "");
      }
      case "balanceSheet": {
        const b = d.bs, R = [];
        R.push(row(["<b>" + t(lang, "b_assets") + "</b>", ""], "sub"));
        R.push(row([t(lang, "b_cash"), usd(b.assets.cash)])); R.push(row([t(lang, "b_ar"), usd(b.assets.ar)]));
        R.push(row([t(lang, "b_inv"), usd(b.assets.inventory)])); R.push(row([t(lang, "b_fixed"), usd(b.assets.fixed)]));
        R.push(row([t(lang, "b_totalA"), usd(b.assets.total)], "tot"));
        R.push(row(["<b>" + t(lang, "b_liab") + "</b>", ""], "sub"));
        R.push(row([t(lang, "b_ap"), usd(b.liabilities.ap)])); R.push(row([t(lang, "b_loans"), usd(b.liabilities.loans)]));
        R.push(row([t(lang, "b_totalL"), usd(b.liabilities.total)], "tot"));
        R.push(row(["<b>" + t(lang, "b_equity") + "</b>", ""], "sub"));
        R.push(row([t(lang, "b_capital"), usd(b.equity.capital)])); R.push(row([t(lang, "b_retained"), usd(b.equity.retained)]));
        R.push(row([t(lang, "b_totalE"), usd(b.equity.total)], "tot"));
        R.push(row([t(lang, "b_totalLE"), usd(b.liabilities.total + b.equity.total)], "tot"));
        const title = I18N.ent(lang, d.entity) + " " + d.year + t(lang, "year_suffix") + " " + t(lang, "balanceSheet");
        return "<p>" + title + " (USD)</p>" + table(R) + "<p class='interp'>✓ " + t(lang, "b_balanced") + "</p>";
      }
      case "compare": {
        const delta = d.curNet - d.prevNet;
        return "<p>" + t(lang, "l_net") + ": " + d.prevP + " " + fig(usd(d.prevNet)) + " → " + d.curP + " " + fig(usd(d.curNet)) +
          " (" + fig((delta < 0 ? "−" : "+") + usd(Math.abs(delta))) + ")</p>" +
          "<div class='dim sm'>" + t(lang, "netTrend") + "</div>" + spark(d.series) +
          "<p class='interp'>" + t(lang, "compareInterp") + "</p>";
      }
      case "laborVsRevenue": {
        const R = [row([t(lang, "lu_dept"), t(lang, "lvr_labor"), t(lang, "lvr_rev"), t(lang, "lvr_flag")], "sub")];
        d.rows.forEach(function (r) {
          R.push(row([I18N.dept(lang, r.deptKey), (r.laborDelta >= 0 ? "+" : "") + usd(r.laborDelta), (r.revDelta >= 0 ? "+" : "") + usd(r.revDelta),
          r.flagged ? '<span class="no">⚑</span>' : '<span class="ok">✓</span>']));
        });
        return "<p>" + t(lang, "lvr_title") + "</p>" + table(R) + "<p class='interp'>" + t(lang, "lvr_interp") + "</p>";
      }
      case "entityRevenue": {
        const R = d.rows.map(function (r) { return row([I18N.ent(lang, r.entity), usd(r.revenue)]); });
        return "<p>" + t(lang, "er_title", { year: d.year }) + " (USD)</p>" + table(R) + spark(d.rows.map(function (r) { return r.revenue; }));
      }
      case "aging": {
        const R = [row([t(lang, "ag_bucket"), t(lang, "ag_amount")], "sub")];
        let total = 0; d.rows.forEach(function (r) { total += r[1]; R.push(row([r[0], usd(r[1])])); });
        R.push(row([t(lang, "ag_total"), usd(total)], "tot"));
        return "<p>" + I18N.ent(lang, d.entity) + " · " + t(lang, d.kind === "ar" ? "ar_title" : "ap_title") + " (USD)</p>" + table(R);
      }
      case "budgetVariance": {
        const R = [row([t(lang, "lu_dept"), t(lang, "bv_budget"), t(lang, "bv_actual"), t(lang, "bv_var")], "sub")];
        d.rows.forEach(function (r) { R.push(row([I18N.dept(lang, r.deptKey), usd(r.budget), usd(r.actual), (r.variance >= 0 ? "+" : "") + usd(r.variance)])); });
        return "<p>" + t(lang, "bv_title", { entity: I18N.ent(lang, d.entity) }) + " (USD)</p>" + table(R);
      }
      case "leaveUsage": {
        const R = [row([t(lang, "lu_dept"), t(lang, "lu_emp"), t(lang, "lu_ent"), t(lang, "lu_used"), t(lang, "lu_rate")], "sub")];
        d.rows.forEach(function (r) { R.push(row([I18N.dept(lang, r.deptKey), r.employees, r.entitled, r.used, r.rate + "%"])); });
        R.push(row([t(lang, "lu_total"), d.total.employees, d.total.entitled, d.total.used, d.total.rate + "%"], "tot"));
        return "<p>" + t(lang, "lu_title", { entity: I18N.ent(lang, d.entity), year: d.year }) + "</p>" + table(R) +
          "<p class='interp'>" + t(lang, "lu_interp", { rate: d.total.rate }) + "</p>";
      }
      case "headcount": {
        const R = [];
        d.rows.forEach(function (e) {
          R.push(row(["<b>" + I18N.ent(lang, e.entity) + "</b>", "<b>" + e.total + "</b>"], "sub"));
          e.byDept.forEach(function (x) { R.push(row([I18N.dept(lang, x.deptKey), x.count])); });
        });
        return "<p>" + t(lang, "hc_title") + "</p>" + table(R);
      }
      case "compensation": return "<p>" + t(lang, "comp_msg", { name: d.name, v: fig(usd(d.salary)) }) + " <span class='dim sm'>" + t(lang, "comp_note") + "</span></p>";
      default: return "<p>—</p>";
    }
  }
  return { render: render };
})();
