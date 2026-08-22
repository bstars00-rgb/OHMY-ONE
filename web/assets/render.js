/* OHMY ONE demo — localized renderer for hotel-distribution reports.
 * Every report ends with an .insight line (the "so what" / action). */
const OHMY_RENDER = (function () {
  "use strict";
  const t = I18N.t;
  function money(n) { n = Number(n); const s = n < 0 ? "-" : ""; n = Math.abs(n); if (n >= 1e6) return s + "$" + (n / 1e6).toFixed(2) + "M"; if (n >= 1e4) return s + "$" + Math.round(n / 1e3) + "K"; return s + "$" + n.toLocaleString("en-US"); }
  function num(n) { return Number(n).toLocaleString("en-US"); }
  function pct(n) { return (Math.round(n * 1000) / 10) + "%"; }
  function pctv(n) { return (Math.round(n * 10) / 10) + "%"; }
  function fig(s) { return '<span class="fig">' + s + "</span>"; }
  function ins(s) { return '<p class="insight">💡 ' + s + "</p>"; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function krw(n) { return "₩" + Number(n).toLocaleString("en-US"); }
  function row(cells, cls) { return '<tr class="' + (cls || "") + '">' + cells.map(function (c, i) { return "<td" + (i ? ' class="n"' : "") + ">" + c + "</td>"; }).join("") + "</tr>"; }
  function table(rows) { return '<div class="tw"><table class="stmt">' + rows.join("") + "</table></div>"; }
  function ent(lang, c) { return I18N.ent(lang, c); }
  function pill(lang, s) { const cls = { PENDING: "warn", APPROVED: "ok2", REJECTED: "no2" }[s] || ""; return '<span class="chip-pill ' + cls + '">' + I18N.status(lang, s) + "</span>"; }
  function spark(series) { if (!series || !series.length) return ""; const mn = Math.min.apply(null, series), mx = Math.max.apply(null, series), w = 220, h = 38, n = series.length; const pts = series.map(function (v, i) { const x = (i / (n - 1)) * (w - 6) + 3; const y = h - 3 - ((v - mn) / (mx - mn || 1)) * (h - 6); return x.toFixed(1) + "," + y.toFixed(1); }); const l = pts[n - 1].split(","); return '<div class="spark"><svg viewBox="0 0 ' + w + " " + h + '" width="' + w + '" height="' + h + '"><polyline fill="none" stroke="var(--accent)" stroke-width="1.6" points="' + pts.join(" ") + '"/><circle cx="' + l[0] + '" cy="' + l[1] + '" r="2.6" fill="var(--accent)"/></svg></div>'; }

  function render(lang, res) {
    const d = res.data || {}, k = res.kind, L = function (key, p) { return t(lang, key, p); };
    switch (k) {
      case "deny": return "<p><b>" + L("denied", { perm: '<span class="no mono">' + (res.need || "") + "</span>" }) + "</b></p><p class='dim sm'>" + L("denied_note") + "</p>";
      case "note": return "<p>" + (d.text === "noop" ? "—" : "—") + "</p>";
      case "whoami": return "<p>" + d.name + " · " + I18N.role(lang, d.role) + " · " + ent(lang, d.entity) + "</p>";

      /* ---------- FINANCE ---------- */
      case "settlement":
        return "<p><b>" + d.seller + "</b> · " + L("sl_cycle") + " " + d.cycle + " · " + d.ccy + "</p>" +
          table([row([L("sl_items"), num(d.items)]), row([L("sl_gmv"), money(d.gmvUSD)]), row([L("sl_paid"), money(d.paidUSD)]),
          row([L("sl_receivable"), fig(money(d.receivableUSD))], "tot"), row([L("sl_overdue"), money(d.overdueUSD) + " (" + pctv(d.overduePct) + ")"])]) +
          ins(L("ins_settlement", { seller: d.seller, pct: pctv(d.overduePct), amt: money(d.overdueUSD) }));
      case "arAging": {
        const b = d.buckets;
        return "<p><b>" + L("ar_title") + "</b> (USD)</p>" +
          table([row([L("ag_bucket"), L("ag_amount")], "sub"), row(["0–15" + L("r_days"), money(b.b0_15)]), row(["16–30" + L("r_days"), money(b.b16_30)]),
          row(["31–60" + L("r_days"), money(b.b31_60)]), row(["60" + L("r_days") + "+", fig(money(b.b60p))]), row([L("ag_total"), money(d.total)], "tot")]) +
          "<p class='dim sm' style='margin-top:8px'>" + L("watch_title") + "</p>" +
          table([row([L("w_seller"), L("w_overdue"), "60" + L("r_days") + "+"], "sub")].concat(d.watch.map(function (w) { return row([w.seller + " <span class='dim sm'>" + w.ccy + "</span>", money(w.overdueUSD), money(w.b60p)]); }))) +
          ins(L("ins_aging", { amt: money(d.over60), seller: d.watch[0] ? d.watch[0].seller : "-" }));
      }
      case "currencyExposure":
        return "<p><b>" + L("cx_title") + "</b></p>" +
          table([row([L("cx_ccy"), L("cx_native"), L("cx_usd")], "sub")].concat(d.rows.map(function (r) { return row([r.ccy, num(r.native), money(r.usd)]); })).concat([row([L("ag_total"), "", money(d.total)], "tot")])) +
          ins(L("ins_currency", { ccy: d.top.ccy, amt: money(d.top.usd), pct: pctv(d.top.usd / d.total * 100) }));
      case "revenueByEntity":
        return "<p><b>" + L("re_title") + "</b> (USD/월)</p>" +
          table([row([L("re_entity"), L("re_gmv"), L("re_net"), L("re_take")], "sub")].concat(d.rows.map(function (r) { return row([ent(lang, r.entity), money(r.gmvUSD), money(r.netUSD), pct(r.take)]); }))) +
          ins(L("ins_revenueEntity", { entity: ent(lang, d.top.entity), amt: money(d.top.netUSD) }));
      case "pnl": {
        const l = d.lines;
        return "<p>" + ent(lang, d.entity) + " " + d.period + " " + L("incomeStatement") + " (USD)</p>" +
          table([row([L("l_revenue"), money(l.revenue)]), row([L("l_cogs"), money(l.cogs)]), row([L("l_gross"), money(l.gross)], "sub"), row([L("l_opex"), money(l.opex)]), row([L("l_op"), money(l.op)], "sub"), row([L("l_oi"), money(l.oi)]), row([L("l_oe"), money(l.oe)]), row([L("l_net"), money(l.net)], "tot")]) +
          (d.series ? "<div class='dim sm' style='margin-top:6px'>" + L("netTrend") + "</div>" + spark(d.series) : "") +
          "<p class='dim sm'>" + L("pnl_note") + "</p>";
      }
      case "balanceSheet": {
        const b = d.bs, Rr = [];
        Rr.push(row(["<b>" + L("b_assets") + "</b>", ""], "sub")); Rr.push(row([L("b_cash"), money(b.assets.cash)])); Rr.push(row([L("b_ar"), money(b.assets.ar)])); Rr.push(row([L("b_fixed"), money(b.assets.fixed)])); Rr.push(row([L("b_totalA"), money(b.assets.total)], "tot"));
        Rr.push(row(["<b>" + L("b_liab") + "</b>", ""], "sub")); Rr.push(row([L("b_ap"), money(b.liabilities.ap)])); Rr.push(row([L("b_loans"), money(b.liabilities.loans)])); Rr.push(row([L("b_totalL"), money(b.liabilities.total)], "tot"));
        Rr.push(row(["<b>" + L("b_equity") + "</b>", ""], "sub")); Rr.push(row([L("b_capital"), money(b.equity.capital)])); Rr.push(row([L("b_retained"), money(b.equity.retained)])); Rr.push(row([L("b_totalE"), money(b.equity.total)], "tot"));
        Rr.push(row([L("b_totalLE"), money(b.liabilities.total + b.equity.total)], "tot"));
        return "<p>" + ent(lang, d.entity) + " " + d.year + " " + L("balanceSheet") + " (USD)</p>" + table(Rr) + "<p class='interp'>✓ " + L("b_balanced") + "</p>";
      }

      /* ---------- OPERATIONS ---------- */
      case "bookingDashboard": {
        const s = d.status;
        return "<p><b>" + L("bd_title") + "</b></p>" +
          table([row([L("bd_bookings"), fig(num(d.total))]), row([L("bd_roomnights"), num(d.roomNights)]), row([L("bd_gmv"), money(d.gmvUSD)]), row([L("bd_net"), money(d.netUSD) + " (" + pct(d.take) + ")"]), row([L("bd_cancel"), fig(pct(d.cancelPct))], "tot")]) +
          "<p class='dim sm' style='margin-top:8px'>" + L("bd_status") + "</p>" +
          table([row([L("st_reserved"), num(s.Reserved)]), row([L("st_confirmed"), num(s.Confirmed)]), row([L("st_cancelled"), num(s.Cancelled + s["Cancelled(Replied)"])]), row([L("st_noshow"), num(s["No-show"])])]) +
          ins(L("ins_booking", { pct: pct(d.cancelPct) }));
      }
      case "cancellation":
        return "<p><b>" + L("cn_title") + "</b> · " + L("cn_overall") + " " + fig(pct(d.overall)) + "</p>" +
          table([row([L("cn_seller"), L("cn_rate"), L("cn_bookings")], "sub")].concat(d.rows.map(function (r) { return row([r.seller, (r.cancelPct >= 0.4 ? '<span class="no">' + pct(r.cancelPct) + "</span>" : pct(r.cancelPct)), num(r.bookings)]); }))) +
          ins(L("ins_cancel", { seller: d.worst.seller, pct: pct(d.worst.cancelPct) }));
      case "bookingsByCountry":
        return "<p><b>" + L("co_title") + "</b></p>" +
          table([row([L("co_country"), L("co_bookings"), L("co_gmv")], "sub")].concat(d.rows.map(function (r) { return row([r.country, num(r.bookings), money(r.gmvUSD)]); }))) +
          ins(L("ins_country", { country: d.top.country }));

      /* ---------- SALES ---------- */
      case "sellerRanking":
        return "<p><b>" + L("rk_title") + "</b> (USD/월)</p>" +
          table([row([L("rk_seller"), L("rk_gmv"), L("rk_net"), L("rk_mom")], "sub")].concat(d.rows.map(function (r) { return row([r.seller, money(r.gmvUSD), money(r.netUSD), (r.momPct >= 0 ? '<span class="ok">+' : '<span class="no">') + pctv(r.momPct * 100) + "</span>"]); }))) +
          ins(L("ins_ranking", { top: d.top.name, grower: d.grower.seller, mom: pctv(d.grower.momPct * 100) }));
      case "newSellers":
        return "<p><b>" + L("ns_title") + "</b> · " + d.count + "</p>" +
          table([row([L("ns_seller"), L("ns_live"), L("ns_entity"), L("ns_gmv")], "sub")].concat(d.rows.map(function (r) { return row([r.seller, r.live, ent(lang, r.entity), money(r.gmvUSD)]); }))) +
          ins(L("ins_new", { count: d.count }));
      case "concentration":
        return "<p><b>" + L("cc_title") + "</b></p>" +
          table([row([L("cc_seller"), L("cc_share")], "sub")].concat(d.top.map(function (r) { return row([r.seller, pctv(r.pct)]); })).concat([row(["Top 5", fig(pctv(d.top5Pct))], "tot")])) +
          ins(L("ins_concentration", { pct: pctv(d.top5Pct) }));

      /* ---------- SUPPLY ---------- */
      case "contractMix":
        return "<p><b>" + L("ct_title") + "</b></p>" +
          table([row([L("ct_type"), L("ct_bookings"), L("ct_gmv"), L("ct_take")], "sub")].concat(d.rows.map(function (r) { return row([L("ctype_" + r.type.split(" ")[0].toLowerCase()), num(r.bookings), money(r.gmvUSD), pct(r.take)]); }))) +
          ins(L("ins_contract", { type: L("ctype_" + d.best.type.split(" ")[0].toLowerCase()), pct: pct(d.best.take) }));

      /* ---------- EXEC ---------- */
      case "execSummary":
        return "<p><b>" + L("ex_title") + "</b> · 2026-08 (USD)</p>" +
          table([row([L("ex_gmv"), fig(money(d.gmvUSD))]), row([L("ex_net"), money(d.netUSD) + " (" + pct(d.take) + ")"]), row([L("ex_bookings"), num(d.bookings)]), row([L("ex_cancel"), pct(d.cancelPct)]), row([L("ex_over60"), '<span class="no">' + money(d.over60) + "</span>"]), row([L("ex_top5"), pctv(d.top5Pct)]), row([L("ex_sellers"), d.sellers])]) +
          ins(L("ins_exec", { cancel: pct(d.cancelPct), over60: money(d.over60), top5: pctv(d.top5Pct) }));

      /* ---------- HR ---------- */
      case "leaveBalance":
        return "<p>" + (d.self ? "" : d.name + " · ") + L("r_annual") + " " + fig((d.remaining).toFixed(1) + L("r_days")) + " <span class='dim sm'>(" + L("r_of", { e: d.entitled, c: d.carried, u: d.used, p: d.pending }) + ")</span></p>";
      case "draftSubmitted": {
        const doc = d.doc, line = d.line.map(function (s, i) { return (i + 1) + ". " + s.name + "(" + I18N.role(lang, s.role) + ")"; }).join("  →  ");
        const rows = doc.rows.map(function (r) { return "<tr><th>" + L(r.k) + "</th><td colspan='3'>" + (r.money ? fig(r.v ? krw(r.v) : L("dr_noamount")) : esc(r.v)) + "</td></tr>"; }).join("");
        const details = doc.details.length ? "<tr><th>" + L("fld_details") + "</th><td colspan='3' class='doc-body'>" + doc.details.map(esc).join("<br>") + "</td></tr>" : "";
        const attach = doc.attachment ? "<tr><th>" + L("fld_attach") + "</th><td colspan='3'>📎 " + esc(doc.attachment) + "</td></tr>" : "";
        return '<div class="doc">' +
          '<div class="doc-head"><span>' + L("fld_docno") + ": " + esc(doc.docNo) + " · " + esc(d.id) + "</span>" + pill(lang, "PENDING") + "</div>" +
          '<div class="doc-title">' + L("doc_" + doc.type) + "</div>" +
          '<table class="doc-tbl">' +
          "<tr><th>" + L("fld_name") + "</th><td>" + esc(doc.drafter.name) + "</td><th>" + L("fld_dept") + "</th><td>" + I18N.dept(lang, OHMY_DATA.DEPT_NAMEKEY[doc.drafter.dept] || "op") + "</td></tr>" +
          "<tr><th>" + L("fld_recipient") + "</th><td colspan='3'>" + esc(doc.recipient) + "</td></tr>" +
          rows + details + attach +
          "</table>" +
          '<div class="doc-line"><b>' + L("dr_line") + "</b>: " + line + "</div>" +
          "</div>" + ins(L("ins_draft", { n: d.line.length, first: d.line[0].name }));
      }
      case "pending":
        return d.rows.length ? "<p>" + L("r_pending_n", { n: d.rows.length }) + "</p>" + d.rows.map(function (r) {
          return "<p>• " + L("dt_" + r.type) + " — " + esc(r.title) + (r.amount ? " (" + krw(r.amount) + ")" : "") + " · " + r.requester +
            " · " + L("dr_step", { cur: r.step, tot: r.steps }) + " <span class='mono'>" + r.id + "</span> " +
            "<button class='mini' data-approve='" + r.id + "'>" + L("approve") + "</button> <button class='mini ghost' data-reject='" + r.id + "'>" + L("reject") + "</button></p>";
        }).join("") : "<p>" + L("no_pending") + "</p>";
      case "approve":
        return d.final
          ? "<p>✅ " + L("dr_approved_final", { title: esc(d.title || L("dt_" + d.type)) }) + "</p>"
          : "<p>" + L("dr_approved_step", { title: esc(d.title || L("dt_" + d.type)), next: d.next, role: I18N.role(lang, d.nextRole) }) + "</p>";
      case "reject": return "<p>" + L("dr_rejected", { title: esc(d.title || L("dt_" + d.type)) }) + "</p>";
      case "leaveUsage": {
        const Rr = [row([L("lu_dept"), L("lu_emp"), L("lu_ent"), L("lu_used"), L("lu_rate")], "sub")];
        d.rows.forEach(function (r) { Rr.push(row([I18N.dept(lang, r.deptKey), r.employees, r.entitled, r.used, r.rate + "%"])); });
        Rr.push(row([L("lu_total"), d.total.employees, d.total.entitled, d.total.used, d.total.rate + "%"], "tot"));
        return "<p><b>" + L("lu_title", { entity: ent(lang, d.entity), year: d.year }) + "</b></p>" + table(Rr) + ins(L("ins_leaveUsage", { rate: d.total.rate }));
      }
      case "headcount":
        return "<p><b>" + L("hc_title") + "</b></p>" + table([row([L("re_entity"), L("lu_emp")], "sub")].concat(d.rows.map(function (r) { return row([ent(lang, r.entity), r.total]); })).concat([row([L("lu_total"), d.total], "tot")]));
      default: return "<p>—</p>";
    }
  }
  return { render: render };
})();
