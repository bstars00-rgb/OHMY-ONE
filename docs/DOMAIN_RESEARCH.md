# OHMY ONE — Domain research (what each team actually asks)

Researched live against the ELLIS reporting API (read-only). This is what
reframed the demo from a generic ERP into OHMY's real business.

## The business

OHMY HOTEL & CO is a **B2B hotel bedbank / distribution intermediary**. It buys
hotel inventory at a **net rate** and distributes it to **sellers/channels**
(OTAs & travel agencies — Agoda, Trip.com, Dida, Traveloka, Klook, Rakuten,
Webbeds, Hana Tour, Myrealtrip, Gotadi, Vietravel, …; ~75 sellers, fast-growing)
at a marked-up **selling rate**. OHMY's revenue = the **margin (take)** between
them, booked per reservation as `revenue` vs `billing` (GMV).

**4 legal entities (owner companies):** Korea `110000`, Japan `120000`,
Vietnam `130000`, Singapore `160000`. Sellers span KR/CN/TW/HK/JP/ID/VN/PH/ES/SG;
currencies KRW/JPY/CNY/USD/VND.

## Real signals observed

- **Volume**: ~9,000 bookings in 3 days (~3k/day).
- **Cancellation is a top KPI**: many records are `Cancelled` / `Cancelled(Replied)`.
- **Booking fields**: `billing` (GMV), `revenue` (OHMY margin), `takeRate`,
  `contractType` (Exclusive/Dynamic/Shared Rate), currency + `fxRate` to KRW base,
  `bookingStatus`, `roomNights`, hotel country/city.
- **Settlement (per seller, per currency)**: `itemCount, billingAmount,
  paidAmount, receivableAmount, overdueAmount, overdueDays`, `settlementCycle`
  (e.g. 15D). Agoda one month ≈ 15,026 items, ~$1.48M billing.

## What each team asks for (drove the new reports)

| Team | Real questions | Reports built |
|---|---|---|
| **Finance / 회계** | 셀러별 미정산·연체 얼마? 통화별 익스포저? 법인별 마진? | settlement, AR aging + overdue watchlist, currency exposure, revenue/margin by entity, P&L, balance sheet |
| **Operations / 운영** | 오늘/이번주 예약·룸나잇, 취소율, 국가별 분포 | booking dashboard, cancellation analysis, bookings by country |
| **Sales / GSM** | 채널 실적 랭킹, 성장률, 신규 셀러 램프, 집중도 리스크 | seller ranking (GMV/net/MoM), new-seller ramp, concentration |
| **Supply / SCM** | 계약유형별 마진, 공급/커버리지 | contract-type mix & margin |
| **HR / 인사** | 법인별 인원, 연차 사용률, 결재 | leave usage by entity/year, headcount, leave workflow |
| **Exec / CEO** | 전사 요약: GMV·마진·취소·연체·집중 리스크 | exec summary dashboard |

## Design change

Every answer now returns **decision-grade** output: the figures **plus an
insight line** (anomaly flagged, recommended action). All money/values are
computed deterministically in the engine (the "DB"); Claude interprets.

> The published demo uses **synthetic, representative** figures in realistic
> ranges. Real seller brands are public; production settlement/booking amounts
> are NOT copied into the public page.
