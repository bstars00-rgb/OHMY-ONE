/* ============================================================
 * OHMY ONE demo — i18n (ko / en / vi / zh / ja)
 * Structured engine output is localized here at render time.
 * ============================================================ */
const I18N = (function () {
  "use strict";
  const LANGS = [["ko", "한국어"], ["en", "English"], ["vi", "Tiếng Việt"], ["zh", "中文"], ["ja", "日本語"]];

  // shared label maps
  const DEPT = {
    op: { ko: "운영", en: "Operations", vi: "Vận hành", zh: "运营", ja: "オペレーション" },
    content: { ko: "콘텐츠", en: "Content", vi: "Nội dung", zh: "内容", ja: "コンテンツ" },
    gsm: { ko: "영업/마케팅", en: "Sales & Mktg", vi: "Kinh doanh & Marketing", zh: "销售与市场", ja: "営業・マーケ" },
    scm: { ko: "공급망", en: "Supply Chain", vi: "Chuỗi cung ứng", zh: "供应链", ja: "サプライチェーン" },
    fin: { ko: "재무", en: "Finance", vi: "Tài chính", zh: "财务", ja: "財務" },
    hr: { ko: "인사", en: "HR", vi: "Nhân sự", zh: "人力资源", ja: "人事" },
    it: { ko: "IT", en: "IT", vi: "CNTT", zh: "IT", ja: "IT" },
  };
  const ENT = {
    OMH_KR: { ko: "한국 법인", en: "Korea", vi: "Hàn Quốc", zh: "韩国", ja: "韓国" },
    OMH_VN: { ko: "베트남 법인", en: "Vietnam", vi: "Việt Nam", zh: "越南", ja: "ベトナム" },
    OMH_SG: { ko: "싱가포르 법인", en: "Singapore", vi: "Singapore", zh: "新加坡", ja: "シンガポール" },
  };
  const ROLE = {
    EMPLOYEE: { ko: "사원", en: "Employee", vi: "Nhân viên", zh: "员工", ja: "社員" },
    TEAM_LEADER: { ko: "팀장", en: "Team Leader", vi: "Trưởng nhóm", zh: "组长", ja: "チームリーダー" },
    FINANCE: { ko: "재무", en: "Finance", vi: "Tài chính", zh: "财务", ja: "財務" },
    HR: { ko: "인사", en: "HR", vi: "Nhân sự", zh: "人力资源", ja: "人事" },
    CEO: { ko: "대표(CEO)", en: "CEO", vi: "CEO", zh: "CEO", ja: "CEO" },
    ADMIN: { ko: "관리자", en: "Admin", vi: "Quản trị", zh: "管理员", ja: "管理者" },
  };
  const STATUS = {
    PENDING: { ko: "대기중", en: "Pending", vi: "Chờ duyệt", zh: "待审批", ja: "承認待ち" },
    APPROVED: { ko: "승인됨", en: "Approved", vi: "Đã duyệt", zh: "已批准", ja: "承認済み" },
    REJECTED: { ko: "반려됨", en: "Rejected", vi: "Từ chối", zh: "已驳回", ja: "却下" },
    CANCELLED: { ko: "취소됨", en: "Cancelled", vi: "Đã hủy", zh: "已取消", ja: "取消" },
  };

  const T = {
    tagline: { ko: "메뉴는 없습니다. 그냥 물어보세요.", en: "No Menu. Just Ask.", vi: "Không menu. Cứ hỏi.", zh: "没有菜单。直接问。", ja: "メニューはありません。ただ聞いてください。" },
    heroSub: {
      ko: "역할을 바꿔가며 질문해 보세요. 모든 숫자는 데이터베이스가 계산하고, 응답에는 호출 함수·권한·감사 기록이 함께 표시됩니다. (실제 DB 없이 브라우저에서 동일 로직을 시뮬레이션)",
      en: "Switch personas and ask. Every figure is computed by the database; each answer shows its function, permission, and audit trail. (Browser-only simulation, no real DB.)",
      vi: "Đổi vai trò và đặt câu hỏi. Mọi con số do cơ sở dữ liệu tính toán; mỗi câu trả lời kèm hàm gọi, quyền và nhật ký kiểm toán. (Mô phỏng trên trình duyệt, không có DB thật.)",
      zh: "切换角色并提问。所有数字均由数据库计算；每个回答都显示所调用的函数、权限和审计记录。（纯浏览器模拟，无真实数据库。）",
      ja: "役割を切り替えて質問してください。すべての数値はデータベースが計算し、回答には呼び出した関数・権限・監査記録が表示されます。（実DBなしのブラウザ内シミュレーション）",
    },
    tab_chat: { ko: "대화", en: "Chat", vi: "Trò chuyện", zh: "对话", ja: "対話" },
    tab_audit: { ko: "감사 로그", en: "Audit Log", vi: "Nhật ký kiểm toán", zh: "审计日志", ja: "監査ログ" },
    tab_arch: { ko: "아키텍처", en: "Architecture", vi: "Kiến trúc", zh: "架构", ja: "アーキテクチャ" },
    panel_perms: { ko: "현재 역할 권한", en: "Current permissions", vi: "Quyền hiện tại", zh: "当前权限", ja: "現在の権限" },
    panel_appr: { ko: "내 결재함", en: "My approvals", vi: "Phê duyệt của tôi", zh: "我的审批", ja: "承認箱" },
    panel_feed: { ko: "실시간 감사 피드", en: "Live audit feed", vi: "Nhật ký trực tiếp", zh: "实时审计", ja: "リアルタイム監査" },
    ask_ph: { ko: "OHMY ONE에게 물어보세요…", en: "Ask OHMY ONE…", vi: "Hỏi OHMY ONE…", zh: "问 OHMY ONE…", ja: "OHMY ONE に質問…" },
    send: { ko: "보내기", en: "Send", vi: "Gửi", zh: "发送", ja: "送信" },
    empty: { ko: "역할을 고르고 질문을 눌러보세요. 요청이 권한 엔진·SQL·감사 파이프라인을 통과합니다.", en: "Pick a persona and ask. Requests pass through the permission engine, SQL, and audit.", vi: "Chọn vai trò và hỏi. Yêu cầu đi qua công cụ phân quyền, SQL và kiểm toán.", zh: "选择角色并提问。请求会经过权限引擎、SQL 和审计。", ja: "役割を選んで質問してください。リクエストは権限エンジン・SQL・監査を通過します。" },
    footer: {
      ko: "표시된 수치는 시연용 대표 샘플이며, 브라우저 안에서 백엔드 로직(권한 엔진·결정론적 계산·감사)을 그대로 재현합니다. 실제 배포 시: Claude → OHMY ONE MCP → 권한 엔진 → SQL → PostgreSQL(RLS) → 감사. 원시 SQL 도구는 없습니다.",
      en: "Figures are representative sample data; the browser reproduces backend logic (permission engine, deterministic calc, audit). In production: Claude → OHMY ONE MCP → permission engine → SQL → PostgreSQL (RLS) → audit. No raw-SQL tool.",
      vi: "Số liệu là dữ liệu mẫu; trình duyệt tái hiện logic backend (phân quyền, tính toán xác định, kiểm toán). Khi triển khai: Claude → OHMY ONE MCP → phân quyền → SQL → PostgreSQL (RLS) → kiểm toán. Không có công cụ SQL thô.",
      zh: "数字为示例数据；浏览器复现后端逻辑（权限引擎、确定性计算、审计）。生产环境：Claude → OHMY ONE MCP → 权限引擎 → SQL → PostgreSQL(RLS) → 审计。无原始 SQL 工具。",
      ja: "数値はサンプルです。ブラウザがバックエンドロジック（権限エンジン・決定論的計算・監査）を再現します。本番: Claude → OHMY ONE MCP → 権限エンジン → SQL → PostgreSQL(RLS) → 監査。生SQLツールはありません。",
    },
    p_user: { ko: "사용자", en: "USER", vi: "NGƯỜI DÙNG", zh: "用户", ja: "ユーザー" },
    p_perm: { ko: "권한엔진", en: "PERMISSION", vi: "PHÂN QUYỀN", zh: "权限引擎", ja: "権限エンジン" },
    p_audit: { ko: "감사", en: "AUDIT", vi: "KIỂM TOÁN", zh: "审计", ja: "監査" },
    a_id: { ko: "ID", en: "ID", vi: "ID", zh: "ID", ja: "ID" },
    a_time: { ko: "시각", en: "Time", vi: "Thời gian", zh: "时间", ja: "時刻" },
    a_action: { ko: "액션", en: "Action", vi: "Hành động", zh: "操作", ja: "アクション" },
    a_actor: { ko: "행위자", en: "Actor", vi: "Người thực hiện", zh: "执行者", ja: "実行者" },
    a_tool: { ko: "도구", en: "Tool", vi: "Công cụ", zh: "工具", ja: "ツール" },
    a_result: { ko: "결과", en: "Result", vi: "Kết quả", zh: "结果", ja: "結果" },
    audit_sub: { ko: "민감 작업은 성공·실패 모두 기록됩니다. 실제 시스템에서는 트리거가 UPDATE/DELETE를 차단합니다.", en: "Sensitive actions are logged whether they succeed or fail. In production, triggers block UPDATE/DELETE.", vi: "Mọi thao tác nhạy cảm đều được ghi, dù thành công hay thất bại. Khi triển khai, trigger chặn UPDATE/DELETE.", zh: "敏感操作无论成功与否都会被记录。生产环境中，触发器会阻止 UPDATE/DELETE。", ja: "機微な操作は成否を問わず記録されます。本番ではトリガーが UPDATE/DELETE を防ぎます。" },
    append_only: { ko: "감사 로그 · 추가 전용(append-only)", en: "Audit log · append-only", vi: "Nhật ký · chỉ thêm (append-only)", zh: "审计日志 · 仅追加", ja: "監査ログ · 追記専用" },

    // provenance
    prov_tool: { ko: "도구", en: "tool", vi: "công cụ", zh: "工具", ja: "ツール" },
    prov_perm: { ko: "권한", en: "perm", vi: "quyền", zh: "权限", ja: "権限" },
    prov_source: { ko: "출처", en: "source", vi: "nguồn", zh: "来源", ja: "出典" },
    prov_audit: { ko: "감사", en: "audit", vi: "kiểm toán", zh: "审计", ja: "監査" },
    badge_db: { ko: "DB가 계산함", en: "computed by DB", vi: "DB tính toán", zh: "由数据库计算", ja: "DBが計算" },
    badge_denied: { ko: "거부 · 감사됨", en: "denied · audited", vi: "từ chối · đã ghi", zh: "拒绝 · 已记录", ja: "拒否 · 監査済" },
    badge_blocked: { ko: "차단됨", en: "blocked", vi: "đã chặn", zh: "已阻止", ja: "ブロック" },
    denied: { ko: "권한이 없어 거부되었습니다. 이 역할에는 {perm} 권한이 없습니다.", en: "Denied — this role lacks the {perm} permission.", vi: "Bị từ chối — vai trò này thiếu quyền {perm}.", zh: "已拒绝 — 该角色缺少 {perm} 权限。", ja: "拒否されました — この役割には {perm} 権限がありません。" },
    denied_note: { ko: "숫자를 지어내지 않습니다 — 요청은 권한 엔진에서 차단되고 감사 로그에 기록됩니다.", en: "Nothing is fabricated — the request is blocked at the permission engine and audited.", vi: "Không bịa số liệu — yêu cầu bị chặn tại lớp phân quyền và được ghi nhận.", zh: "不编造数字 — 请求在权限引擎处被拦截并记录。", ja: "数値を捏造しません — リクエストは権限エンジンで遮断され監査されます。" },
    blocked_note: { ko: "CRITICAL 등급 — 되돌릴 수 없는 작업으로 자동 실행되지 않습니다. 관리자 콘솔에서 사람이 이중 통제로 수행해야 합니다.", en: "CRITICAL tier — irreversible, never auto-executed. A human must perform it under dual control in the admin console.", vi: "Cấp CRITICAL — không thể hoàn tác, không tự chạy. Phải do người thực hiện với kiểm soát kép trong bảng quản trị.", zh: "CRITICAL 级 — 不可逆，绝不自动执行。须由人在管理控制台双重控制下操作。", ja: "CRITICAL 等級 — 取り消し不可、自動実行しません。管理コンソールで人が二重統制のもと実行します。" },
    unrecognized: { ko: "요청을 이해하지 못했어요. 예시 버튼을 눌러보거나 다르게 물어봐 주세요.", en: "I didn't catch that. Try an example button or rephrase.", vi: "Chưa hiểu yêu cầu. Hãy thử nút ví dụ hoặc diễn đạt lại.", zh: "没有理解该请求。请点击示例按钮或换种问法。", ja: "理解できませんでした。例のボタンを押すか、言い換えてください。" },
    no_perm_role: { ko: "이 역할에는 결재 권한이 없습니다.", en: "This role has no approval permission.", vi: "Vai trò này không có quyền phê duyệt.", zh: "该角色没有审批权限。", ja: "この役割には承認権限がありません。" },
    no_pending: { ko: "대기 중인 결재가 없습니다.", en: "No pending approvals.", vi: "Không có phê duyệt chờ.", zh: "没有待审批项。", ja: "承認待ちはありません。" },
    approve: { ko: "승인", en: "Approve", vi: "Duyệt", zh: "批准", ja: "承認" },
    reject: { ko: "반려", en: "Reject", vi: "Từ chối", zh: "驳回", ja: "却下" },

    // report labels
    r_remaining: { ko: "잔여", en: "remaining", vi: "còn lại", zh: "剩余", ja: "残り" },
    r_annual: { ko: "연차", en: "Annual", vi: "Phép năm", zh: "年假", ja: "年次休暇" },
    r_sick: { ko: "병가", en: "Sick", vi: "Nghỉ ốm", zh: "病假", ja: "病気休暇" },
    r_days: { ko: "일", en: "days", vi: "ngày", zh: "天", ja: "日" },
    r_of: { ko: "부여 {e} · 이월 {c} · 사용 {u} · 대기 {p}", en: "entitled {e} · carried {c} · used {u} · pending {p}", vi: "được cấp {e} · chuyển {c} · dùng {u} · chờ {p}", zh: "应享 {e} · 结转 {c} · 已用 {u} · 待定 {p}", ja: "付与 {e} · 繰越 {c} · 使用 {u} · 保留 {p}" },
    r_created: { ko: "{date} {type} {days}일 신청이 접수되었습니다.", en: "Leave request submitted: {type} {days}d on {date}.", vi: "Đã gửi đơn nghỉ: {type} {days} ngày, {date}.", zh: "已提交请假：{type} {days}天，{date}。", ja: "休暇申請を受け付けました：{type} {days}日 {date}。" },
    r_approver: { ko: "승인 경로", en: "Approver", vi: "Người duyệt", zh: "审批人", ja: "承認者" },
    r_reserved: { ko: "잔여에서 {days}일이 예약되었습니다. 멱등키로 중복 신청이 방지됩니다.", en: "{days}d reserved from balance. Idempotency key prevents duplicates.", vi: "Đã giữ {days} ngày. Khóa idempotency chống trùng lặp.", zh: "已从余额预留 {days} 天。幂等键防止重复。", ja: "残高から{days}日を確保。冪等キーで重複を防止。" },
    r_approved_msg: { ko: "{name}님의 {type} {date} 요청을 승인했습니다. 예약분이 사용으로 확정되었습니다.", en: "Approved {name}'s {type} on {date}. Reserved days confirmed as used.", vi: "Đã duyệt {type} ngày {date} của {name}. Ngày giữ chỗ chuyển thành đã dùng.", zh: "已批准 {name} 的 {type}（{date}）。预留天数确认为已用。", ja: "{name}さんの{type} {date}を承認しました。確保分が使用として確定。" },
    r_rejected_msg: { ko: "{name}님의 요청을 반려했습니다. 예약분이 해제되었습니다.", en: "Rejected {name}'s request. Reserved days released.", vi: "Đã từ chối yêu cầu của {name}. Ngày giữ chỗ được giải phóng.", zh: "已驳回 {name} 的请求。预留天数已释放。", ja: "{name}さんの申請を却下しました。確保分を解放。" },
    r_pending_n: { ko: "승인 대기 {n}건:", en: "{n} pending approval(s):", vi: "{n} phê duyệt đang chờ:", zh: "{n} 项待审批：", ja: "承認待ち {n}件:" },
    r_revenue: { ko: "{period} {entity} 매출은 {v} 입니다.", en: "{entity} revenue for {period}: {v}.", vi: "Doanh thu {entity} kỳ {period}: {v}.", zh: "{entity} {period} 营收：{v}。", ja: "{entity} {period} の売上は {v}。" },
    ledgerNote: { ko: "(POSTED 원장 집계)", en: "(from posted ledger)", vi: "(từ sổ cái đã ghi)", zh: "（来自已过账分录）", ja: "（記帳済み元帳より）" },

    incomeStatement: { ko: "손익계산서", en: "Income Statement", vi: "Báo cáo kết quả kinh doanh", zh: "损益表", ja: "損益計算書" },
    l_revenue: { ko: "매출", en: "Revenue", vi: "Doanh thu", zh: "营收", ja: "売上" },
    l_cogs: { ko: "매출원가", en: "COGS", vi: "Giá vốn", zh: "营业成本", ja: "売上原価" },
    l_gross: { ko: "매출총이익", en: "Gross Profit", vi: "Lợi nhuận gộp", zh: "毛利", ja: "売上総利益" },
    l_opex: { ko: "판관비", en: "Operating Exp.", vi: "Chi phí HĐ", zh: "营业费用", ja: "販管費" },
    l_op: { ko: "영업이익", en: "Operating Profit", vi: "Lợi nhuận HĐ", zh: "营业利润", ja: "営業利益" },
    l_oi: { ko: "기타수익", en: "Other Income", vi: "Thu nhập khác", zh: "其他收入", ja: "その他収益" },
    l_oe: { ko: "기타비용", en: "Other Expense", vi: "Chi phí khác", zh: "其他支出", ja: "その他費用" },
    l_net: { ko: "당기순이익", en: "Net Profit", vi: "Lợi nhuận ròng", zh: "净利润", ja: "当期純利益" },

    balanceSheet: { ko: "재무상태표(대차대조표)", en: "Balance Sheet", vi: "Bảng cân đối kế toán", zh: "资产负债表", ja: "貸借対照表" },
    b_assets: { ko: "자산", en: "Assets", vi: "Tài sản", zh: "资产", ja: "資産" },
    b_cash: { ko: "현금및현금성자산", en: "Cash & equivalents", vi: "Tiền & tương đương", zh: "现金及等价物", ja: "現金及び預金" },
    b_ar: { ko: "매출채권", en: "Accounts receivable", vi: "Phải thu", zh: "应收账款", ja: "売掛金" },
    b_inv: { ko: "재고자산", en: "Inventory", vi: "Hàng tồn kho", zh: "存货", ja: "棚卸資産" },
    b_fixed: { ko: "유형자산", en: "Fixed assets", vi: "Tài sản cố định", zh: "固定资产", ja: "固定資産" },
    b_totalA: { ko: "자산총계", en: "Total assets", vi: "Tổng tài sản", zh: "资产合计", ja: "資産合計" },
    b_liab: { ko: "부채", en: "Liabilities", vi: "Nợ phải trả", zh: "负债", ja: "負債" },
    b_ap: { ko: "매입채무", en: "Accounts payable", vi: "Phải trả", zh: "应付账款", ja: "買掛金" },
    b_loans: { ko: "차입금", en: "Loans", vi: "Vay", zh: "借款", ja: "借入金" },
    b_totalL: { ko: "부채총계", en: "Total liabilities", vi: "Tổng nợ", zh: "负债合计", ja: "負債合計" },
    b_equity: { ko: "자본", en: "Equity", vi: "Vốn chủ sở hữu", zh: "所有者权益", ja: "純資産" },
    b_capital: { ko: "자본금", en: "Capital", vi: "Vốn góp", zh: "实收资本", ja: "資本金" },
    b_retained: { ko: "이익잉여금", en: "Retained earnings", vi: "LN giữ lại", zh: "留存收益", ja: "利益剰余金" },
    b_totalE: { ko: "자본총계", en: "Total equity", vi: "Tổng vốn CSH", zh: "权益合计", ja: "純資産合計" },
    b_totalLE: { ko: "부채와자본총계", en: "Total liab. & equity", vi: "Tổng nợ & vốn", zh: "负债和权益合计", ja: "負債・純資産合計" },
    b_balanced: { ko: "자산총계 = 부채와자본총계 (대차 일치)", en: "Assets = Liabilities + Equity (balanced)", vi: "Tài sản = Nợ + Vốn (cân đối)", zh: "资产 = 负债 + 权益（平衡）", ja: "資産 = 負債 + 純資産（一致）" },

    netTrend: { ko: "순이익 추이 (12개월)", en: "Net profit trend (12 mo)", vi: "Xu hướng LN ròng (12 tháng)", zh: "净利润趋势（12个月）", ja: "純利益推移（12ヶ月）" },
    compareInterp: { ko: "Claude 해석: 매출은 정체된 반면 인건비가 증가한 것이 이익 감소의 주요 동인입니다. 위 숫자는 DB가 계산했고 이 문장만 해석입니다.", en: "Claude's read: revenue was flat while labor cost rose — the main driver of the drop. The numbers came from the DB; only this sentence is interpretation.", vi: "Claude nhận định: doanh thu đi ngang trong khi chi phí nhân sự tăng — nguyên nhân chính. Các số do DB tính; chỉ câu này là diễn giải.", zh: "Claude 解读：营收持平而人力成本上升，是利润下降的主因。数字来自数据库，仅此句为解读。", ja: "Claudeの解釈：売上が横ばいの一方で人件費が増加したことが減益の主因です。数値はDBが計算し、この文のみ解釈です。" },
    lvr_title: { ko: "부서별 인건비 vs 매출 변화 (전기 대비)", en: "Labor vs revenue change by department", vi: "Thay đổi nhân sự vs doanh thu theo phòng ban", zh: "各部门人力成本与营收变化", ja: "部門別 人件費 vs 売上の変化" },
    lvr_labor: { ko: "인건비 Δ", en: "Labor Δ", vi: "Nhân sự Δ", zh: "人力 Δ", ja: "人件費 Δ" },
    lvr_rev: { ko: "매출 Δ", en: "Revenue Δ", vi: "Doanh thu Δ", zh: "营收 Δ", ja: "売上 Δ" },
    lvr_flag: { ko: "주의", en: "flag", vi: "cảnh báo", zh: "警示", ja: "注意" },
    lvr_normal: { ko: "정상", en: "ok", vi: "bình thường", zh: "正常", ja: "正常" },
    lvr_interp: { ko: "Claude 해석: 표시(⚑)된 부서는 인건비가 늘었으나 매출이 따라오지 못했습니다.", en: "Claude's read: flagged (⚑) departments raised labor cost without matching revenue.", vi: "Claude: các phòng ban (⚑) tăng chi phí nhân sự nhưng doanh thu không theo kịp.", zh: "Claude 解读：标记(⚑)的部门人力成本上升但营收未跟上。", ja: "Claudeの解釈：⚑の部門は人件費が増えたが売上が追いついていません。" },

    lu_title: { ko: "{entity} {year}년 연차 사용 분석", en: "{entity} {year} leave usage analysis", vi: "Phân tích sử dụng phép {entity} năm {year}", zh: "{entity} {year}年年假使用分析", ja: "{entity} {year}年 有給取得分析" },
    lu_dept: { ko: "부서", en: "Department", vi: "Phòng ban", zh: "部门", ja: "部門" },
    lu_emp: { ko: "인원", en: "Employees", vi: "Nhân sự", zh: "人数", ja: "人数" },
    lu_ent: { ko: "부여일수", en: "Entitled", vi: "Được cấp", zh: "应享", ja: "付与" },
    lu_used: { ko: "사용일수", en: "Used", vi: "Đã dùng", zh: "已用", ja: "使用" },
    lu_rate: { ko: "소진율", en: "Usage %", vi: "Tỷ lệ %", zh: "使用率", ja: "取得率" },
    lu_total: { ko: "합계", en: "Total", vi: "Tổng", zh: "合计", ja: "合計" },
    lu_interp: { ko: "Claude 해석: 전사 소진율 {rate}%. 소진율이 낮은 부서는 미사용 연차 부담이 누적될 수 있습니다.", en: "Claude's read: company usage {rate}%. Low-usage departments risk accruing unused leave liability.", vi: "Claude: tỷ lệ toàn công ty {rate}%. Phòng ban dùng ít có thể tích lũy nợ phép chưa dùng.", zh: "Claude 解读：全公司使用率 {rate}%。使用率低的部门可能累积未休假负债。", ja: "Claudeの解釈：全社取得率 {rate}%。取得率が低い部門は未消化有給の負担が蓄積する恐れ。" },

    hc_title: { ko: "법인별 인원 현황", en: "Headcount by entity", vi: "Nhân sự theo pháp nhân", zh: "各法人人数", ja: "法人別 人員" },
    er_title: { ko: "{year}년 법인별 매출 비교", en: "{year} revenue by entity", vi: "Doanh thu theo pháp nhân {year}", zh: "{year}年各法人营收", ja: "{year}年 法人別売上" },
    ar_title: { ko: "매출채권 연령분석", en: "AR aging", vi: "Tuổi nợ phải thu", zh: "应收账款账龄", ja: "売掛金エイジング" },
    ap_title: { ko: "매입채무 연령분석", en: "AP aging", vi: "Tuổi nợ phải trả", zh: "应付账款账龄", ja: "買掛金エイジング" },
    ag_bucket: { ko: "구간(일)", en: "Bucket (days)", vi: "Khoảng (ngày)", zh: "区间（天）", ja: "区分（日）" },
    ag_amount: { ko: "금액", en: "Amount", vi: "Số tiền", zh: "金额", ja: "金額" },
    ag_total: { ko: "합계", en: "Total", vi: "Tổng", zh: "合计", ja: "合計" },
    bv_title: { ko: "{entity} 부서별 예산 대비 실적 (월)", en: "{entity} budget vs actual by dept (monthly)", vi: "{entity} ngân sách vs thực tế theo phòng (tháng)", zh: "{entity} 各部门预算对比实际（月）", ja: "{entity} 部門別 予算対実績（月次）" },
    bv_budget: { ko: "예산", en: "Budget", vi: "Ngân sách", zh: "预算", ja: "予算" },
    bv_actual: { ko: "실적", en: "Actual", vi: "Thực tế", zh: "实际", ja: "実績" },
    bv_var: { ko: "차이", en: "Variance", vi: "Chênh lệch", zh: "差异", ja: "差異" },
    comp_msg: { ko: "{name} 기본급: {v}", en: "{name} base salary: {v}", vi: "Lương cơ bản {name}: {v}", zh: "{name} 基本工资：{v}", ja: "{name} 基本給: {v}" },
    comp_note: { ko: "(민감정보 · 접근 감사됨)", en: "(sensitive · access audited)", vi: "(nhạy cảm · đã ghi nhận)", zh: "（敏感 · 已审计）", ja: "（機微 · アクセス監査済）" },
    tl_title: { ko: "팀 연차 현황", en: "Team leave", vi: "Phép của nhóm", zh: "团队休假", ja: "チーム休暇" },
    year_suffix: { ko: "년", en: "", vi: "", zh: "年", ja: "年" },
  };

  // chip catalog: intent-driven so clicking always works regardless of language
  const CHIPS = [
    { cat: "HR", intent: "leaveBalance" },
    { cat: "HR", intent: "createLeave" },
    { cat: "APPROVAL", intent: "pending" },
    { cat: "FINANCE", intent: "revenue" },
    { cat: "FINANCE", intent: "pnlMonth" },
    { cat: "FINANCE", intent: "pnlYear", args: { year: 2025 } },
    { cat: "FINANCE", intent: "balanceSheet", args: { year: 2025 } },
    { cat: "FINANCE", intent: "entityRevenue", args: { year: 2025 } },
    { cat: "FINANCE", intent: "arAging" },
    { cat: "HR", intent: "leaveUsage", args: { entity: "OMH_VN", year: 2025 } },
    { cat: "HR", intent: "headcount" },
    { cat: "EXEC", intent: "compareProfit" },
    { cat: "EXEC", intent: "laborVsRevenue" },
    { cat: "HR", intent: "compensation", args: { target: "CEO" } },
  ];
  const CHIP_LABEL = {
    leaveBalance: { ko: "내 연차 얼마나 남았어?", en: "How much leave do I have left?", vi: "Tôi còn bao nhiêu phép?", zh: "我还剩多少年假？", ja: "有給はあとどれくらい？" },
    createLeave: { ko: "내일 연차 쓸게.", en: "I'll take leave tomorrow.", vi: "Ngày mai tôi nghỉ phép.", zh: "我明天请假。", ja: "明日 有給を取ります。" },
    pending: { ko: "내가 승인해야 할 것 보여줘.", en: "Show what I need to approve.", vi: "Hiển thị mục cần tôi duyệt.", zh: "显示需要我审批的。", ja: "承認すべきものを表示。" },
    revenue: { ko: "이번달 매출 알려줘.", en: "This month's revenue?", vi: "Doanh thu tháng này?", zh: "本月营收？", ja: "今月の売上は？" },
    pnlMonth: { ko: "이번달 P&L 만들어줘.", en: "Build this month's P&L.", vi: "Lập P&L tháng này.", zh: "生成本月损益表。", ja: "今月のP&Lを作成。" },
    pnlYear: { ko: "2025년 연간 손익계산서 보여줘.", en: "Show the 2025 annual income statement.", vi: "Báo cáo KQKD năm 2025.", zh: "查看2025年年度损益表。", ja: "2025年 年間損益計算書。" },
    balanceSheet: { ko: "2025년 재무상태표 뽑아줘.", en: "Pull the 2025 balance sheet.", vi: "Xuất bảng cân đối 2025.", zh: "导出2025年资产负债表。", ja: "2025年 貸借対照表を出して。" },
    entityRevenue: { ko: "2025년 법인별 매출 비교.", en: "2025 revenue by entity.", vi: "Doanh thu 2025 theo pháp nhân.", zh: "2025各法人营收对比。", ja: "2025 法人別売上比較。" },
    arAging: { ko: "매출채권 연령분석 보여줘.", en: "Show AR aging.", vi: "Xem tuổi nợ phải thu.", zh: "查看应收账龄。", ja: "売掛金エイジング。" },
    leaveUsage: { ko: "2025년 베트남 직원 연차 사용 분석표.", en: "2025 Vietnam staff leave usage analysis.", vi: "Phân tích phép nhân viên VN 2025.", zh: "2025越南员工年假使用分析。", ja: "2025 ベトナム社員 有給分析。" },
    headcount: { ko: "법인별 인원 현황.", en: "Headcount by entity.", vi: "Nhân sự theo pháp nhân.", zh: "各法人人数。", ja: "法人別 人員。" },
    compareProfit: { ko: "지난달보다 이익이 왜 줄었어?", en: "Why did profit fall vs last month?", vi: "Vì sao LN giảm so tháng trước?", zh: "为何利润比上月下降？", ja: "先月より利益が減った理由は？" },
    laborVsRevenue: { ko: "인건비 늘고 매출 안 따라온 조직?", en: "Which units: labor up, revenue not?", vi: "Đơn vị nào nhân sự tăng mà doanh thu không?", zh: "哪些部门人力升营收未跟上？", ja: "人件費増だが売上が伴わない組織は？" },
    compensation: { ko: "CEO 급여 알려줘.", en: "Show the CEO's salary.", vi: "Cho biết lương CEO.", zh: "查看CEO薪资。", ja: "CEOの給与を表示。" },
  };

  function t(lang, key, params) {
    const e = T[key]; let s = e ? (e[lang] || e.en) : key;
    if (params) for (const k in params) s = s.replace(new RegExp("{" + k + "}", "g"), params[k]);
    return s;
  }
  return {
    LANGS: LANGS, CHIPS: CHIPS,
    t: t,
    dept: function (lang, k) { return (DEPT[k] && (DEPT[k][lang] || DEPT[k].en)) || k; },
    ent: function (lang, c) { return (ENT[c] && (ENT[c][lang] || ENT[c].en)) || c; },
    role: function (lang, r) { return (ROLE[r] && (ROLE[r][lang] || ROLE[r].en)) || r; },
    status: function (lang, s) { return (STATUS[s] && (STATUS[s][lang] || STATUS[s].en)) || s; },
    chipLabel: function (lang, intent) { const e = CHIP_LABEL[intent]; return e ? (e[lang] || e.en) : intent; },
  };
})();
