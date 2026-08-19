-- ============================================================
-- OHMY ONE — Synthetic seed data (OHMY HOTEL, fictional)
-- Deterministic where it matters; finance reconciles by construction.
-- All persons/figures are invented for the prototype.
-- ============================================================
set client_min_messages = warning;

-- ---------- A. Organizations ----------
insert into organizations (code, name, region, currency) values
  ('OMH',    'OHMYHOTEL Group',      'APAC', 'USD'),
  ('OMH_KR', 'OHMYHOTEL Korea',      'APAC', 'USD'),
  ('OMH_VN', 'OHMYHOTEL Vietnam',    'APAC', 'USD'),
  ('OMH_SG', 'OHMYHOTEL Singapore',  'APAC', 'USD');
update organizations set parent_id = (select id from organizations where code='OMH')
  where code in ('OMH_KR','OMH_VN','OMH_SG');

-- Primary operating entity for the prototype:
--   let :org = OMH_KR
-- ---------- B. Departments ----------
insert into departments (organization_id, code, name)
select o.id, d.code, d.name
from organizations o,
  (values ('CEO_OFFICE','CEO Office'),('OP','Operations'),('CONTENT','Content'),
          ('GSM','Global Sales & Marketing'),('SCM','Supply Chain'),
          ('FIN','Finance'),('HR','Human Resources'),('IT','IT')) d(code,name)
where o.code='OMH_KR';

-- ---------- C. Teams ----------
insert into teams (organization_id, department_id, code, name)
select o.id, dp.id, t.code, t.name
from organizations o
join departments dp on dp.organization_id=o.id and dp.code=t.dept
, (values
    ('CEO','CEO Office','CEO_OFFICE'),
    ('OP1','Operations 1','OP'),('OP2','Operations 2','OP'),
    ('CONTENT','Content','CONTENT'),('GSM','GSM','GSM'),('SCM','SCM','SCM'),
    ('FIN','Finance','FIN'),('HR','HR','HR'),('IT','IT','IT')
  ) t(code,name,dept)
where o.code='OMH_KR';

-- ---------- D. Employees ----------
insert into employees (organization_id, department_id, team_id, user_id, employee_no, full_name, email, title, hire_date, base_salary)
select o.id, dp.id, tm.id, gen_random_uuid(), e.no, e.name, e.email, e.title, e.hire::date, e.salary
from organizations o
join departments dp on dp.organization_id=o.id and dp.code=e.dept
join teams tm on tm.organization_id=o.id and tm.code=e.team
, (values
  ('E001','Grace Choi','grace.choi@ohmyhotel.com','CEO','CEO_OFFICE','CEO','2018-01-02',420000),
  ('E002','Henry Lim','henry.lim@ohmyhotel.com','CTO','CEO_OFFICE','CEO','2018-03-01',360000),
  ('E003','Ian Seo','ian.seo@ohmyhotel.com','CSO','CEO_OFFICE','CEO','2019-02-01',330000),
  ('E004','David Kim','david.kim@ohmyhotel.com','OP Team Lead','OP','OP1','2019-05-06',110000),
  ('E005','Lucy Park','lucy.park@ohmyhotel.com','OP Specialist','OP','OP1','2021-07-01',62000),
  ('E006','Mina Jung','mina.jung@ohmyhotel.com','OP Specialist','OP','OP1','2021-09-01',60000),
  ('E007','Noah Han','noah.han@ohmyhotel.com','OP Specialist','OP','OP1','2022-01-10',58000),
  ('E008','Olivia Yoon','olivia.yoon@ohmyhotel.com','OP Team Lead','OP','OP2','2020-03-02',108000),
  ('E009','Peter Kang','peter.kang@ohmyhotel.com','OP Specialist','OP','OP2','2022-04-01',57000),
  ('E010','Quinn Ryu','quinn.ryu@ohmyhotel.com','OP Specialist','OP','OP2','2022-06-01',56000),
  ('E011','Rachel Baek','rachel.baek@ohmyhotel.com','OP Specialist','OP','OP2','2023-01-09',55000),
  ('E012','Sam Oh','sam.oh@ohmyhotel.com','OP Specialist','OP','OP1','2023-03-01',54000),
  ('E013','Tina Moon','tina.moon@ohmyhotel.com','Content Lead','CONTENT','CONTENT','2019-08-01',105000),
  ('E014','Uma Shin','uma.shin@ohmyhotel.com','Content Editor','CONTENT','CONTENT','2021-02-01',58000),
  ('E015','Victor Ko','victor.ko@ohmyhotel.com','Content Editor','CONTENT','CONTENT','2021-11-01',57000),
  ('E016','Wendy Nam','wendy.nam@ohmyhotel.com','Content Editor','CONTENT','CONTENT','2022-05-01',55000),
  ('E017','Xavier Gu','xavier.gu@ohmyhotel.com','Content Editor','CONTENT','CONTENT','2023-02-01',53000),
  ('E018','Yuna Jang','yuna.jang@ohmyhotel.com','GSM Lead','GSM','GSM','2019-06-01',104000),
  ('E019','Zack Bae','zack.bae@ohmyhotel.com','GSM Specialist','GSM','GSM','2021-04-01',59000),
  ('E020','Amy Cho','amy.cho@ohmyhotel.com','GSM Specialist','GSM','GSM','2022-08-01',56000),
  ('E021','Ben Suh','ben.suh@ohmyhotel.com','SCM Lead','SCM','SCM','2019-10-01',102000),
  ('E022','Cora Min','cora.min@ohmyhotel.com','SCM Specialist','SCM','SCM','2021-05-01',58000),
  ('E023','Dan Woo','dan.woo@ohmyhotel.com','SCM Specialist','SCM','SCM','2022-09-01',55000),
  ('E024','Fiona Lee','fiona.lee@ohmyhotel.com','Finance Lead','FIN','FIN','2019-04-01',115000),
  ('E025','Gary Im','gary.im@ohmyhotel.com','Finance Analyst','FIN','FIN','2021-06-01',68000),
  ('E026','Helen Ahn','helen.ahn@ohmyhotel.com','Finance Analyst','FIN','FIN','2022-07-01',65000),
  ('E027','Hana Seo','hana.seo@ohmyhotel.com','HR Lead','HR','HR','2019-07-01',108000),
  ('E028','Ivy Ha','ivy.ha@ohmyhotel.com','HR Specialist','HR','HR','2022-02-01',60000),
  ('E029','Jake Yang','jake.yang@ohmyhotel.com','IT Lead','IT','IT','2019-09-01',112000),
  ('E030','Kelly Do','kelly.do@ohmyhotel.com','IT Specialist','IT','IT','2022-10-01',66000)
 ) e(no,name,email,title,dept,team,hire,salary)
where o.code='OMH_KR';

insert into user_profiles (employee_id, display_name)
select id, full_name from employees;

-- ---------- E. Managers, team leaders, department managers ----------
-- team leaders
update teams t set leader_id = e.id from employees e
where e.employee_no = case t.code
  when 'CEO' then 'E001' when 'OP1' then 'E004' when 'OP2' then 'E008'
  when 'CONTENT' then 'E013' when 'GSM' then 'E018' when 'SCM' then 'E021'
  when 'FIN' then 'E024' when 'HR' then 'E027' when 'IT' then 'E029' end;
-- department managers
update departments d set manager_id = e.id from employees e
where e.employee_no = case d.code
  when 'CEO_OFFICE' then 'E001' when 'OP' then 'E004' when 'CONTENT' then 'E013'
  when 'GSM' then 'E018' when 'SCM' then 'E021' when 'FIN' then 'E024'
  when 'HR' then 'E027' when 'IT' then 'E029' end;
-- reporting lines
update employees m set manager_id = mgr.id from employees mgr
where mgr.employee_no = case m.employee_no
  when 'E001' then null
  when 'E002' then 'E001' when 'E003' then 'E001'
  when 'E004' then 'E001' when 'E008' then 'E001' when 'E013' then 'E001'
  when 'E018' then 'E001' when 'E021' then 'E001' when 'E024' then 'E001'
  when 'E027' then 'E001' when 'E029' then 'E001'
  when 'E005' then 'E004' when 'E006' then 'E004' when 'E007' then 'E004' when 'E012' then 'E004'
  when 'E009' then 'E008' when 'E010' then 'E008' when 'E011' then 'E008'
  when 'E014' then 'E013' when 'E015' then 'E013' when 'E016' then 'E013' when 'E017' then 'E013'
  when 'E019' then 'E018' when 'E020' then 'E018'
  when 'E022' then 'E021' when 'E023' then 'E021'
  when 'E025' then 'E024' when 'E026' then 'E024'
  when 'E028' then 'E027'
  when 'E030' then 'E029' end
and m.employee_no <> 'E001';

-- ---------- F. Roles & permissions ----------
insert into roles (code, name) values
  ('EMPLOYEE','Employee'),('TEAM_LEADER','Team Leader'),('MANAGER','Manager'),
  ('DIRECTOR','Director'),('HR','HR'),('FINANCE','Finance'),
  ('CTO','CTO'),('CSO','CSO'),('CEO','CEO'),('ADMIN','Admin');

insert into permissions (code, domain, description) values
  ('HR_LEAVE_READ_SELF','HR','Read own leave balance/requests'),
  ('HR_LEAVE_CREATE_SELF','HR','Create own leave request'),
  ('HR_LEAVE_READ_TEAM','HR','Read leave of teams the user leads'),
  ('HR_LEAVE_READ_ALL','HR','Read leave company-wide'),
  ('HR_LEAVE_APPROVE','HR','Approve leave requests'),
  ('HR_EMPLOYEE_READ_ALL','HR','Read all employee records incl. compensation'),
  ('FINANCE_REVENUE_READ','FINANCE','Read revenue figures'),
  ('FINANCE_EXPENSE_READ','FINANCE','Read expense figures'),
  ('FINANCE_PNL_READ','FINANCE','Read P&L / budgets'),
  ('APPROVAL_READ','APPROVAL','Read approval requests'),
  ('APPROVAL_APPROVE','APPROVAL','Approve requests'),
  ('APPROVAL_REJECT','APPROVAL','Reject requests'),
  ('ADMIN_RBAC_MANAGE','ADMIN','Manage roles/permissions'),
  ('ADMIN_AUDIT_READ','ADMIN','Read audit log'),
  ('ADMIN_CONFIG','ADMIN','System configuration');

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r join permissions p on true
join (values
  ('EMPLOYEE','HR_LEAVE_READ_SELF'),('EMPLOYEE','HR_LEAVE_CREATE_SELF'),
  ('TEAM_LEADER','HR_LEAVE_READ_SELF'),('TEAM_LEADER','HR_LEAVE_CREATE_SELF'),
  ('TEAM_LEADER','HR_LEAVE_READ_TEAM'),('TEAM_LEADER','APPROVAL_READ'),
  ('TEAM_LEADER','APPROVAL_APPROVE'),('TEAM_LEADER','APPROVAL_REJECT'),
  ('MANAGER','HR_LEAVE_READ_SELF'),('MANAGER','HR_LEAVE_CREATE_SELF'),
  ('MANAGER','HR_LEAVE_READ_TEAM'),('MANAGER','APPROVAL_READ'),
  ('MANAGER','APPROVAL_APPROVE'),('MANAGER','APPROVAL_REJECT'),
  ('HR','HR_LEAVE_READ_SELF'),('HR','HR_LEAVE_CREATE_SELF'),('HR','HR_LEAVE_READ_TEAM'),
  ('HR','HR_LEAVE_READ_ALL'),('HR','HR_LEAVE_APPROVE'),('HR','HR_EMPLOYEE_READ_ALL'),
  ('HR','APPROVAL_READ'),('HR','APPROVAL_APPROVE'),('HR','APPROVAL_REJECT'),
  ('FINANCE','HR_LEAVE_READ_SELF'),('FINANCE','HR_LEAVE_CREATE_SELF'),
  ('FINANCE','FINANCE_REVENUE_READ'),('FINANCE','FINANCE_EXPENSE_READ'),('FINANCE','FINANCE_PNL_READ'),
  ('CEO','HR_LEAVE_READ_SELF'),('CEO','HR_LEAVE_READ_ALL'),('CEO','APPROVAL_READ'),
  ('CEO','FINANCE_REVENUE_READ'),('CEO','FINANCE_EXPENSE_READ'),('CEO','FINANCE_PNL_READ'),
  ('CTO','HR_LEAVE_READ_SELF'),('CTO','FINANCE_REVENUE_READ'),('CTO','FINANCE_EXPENSE_READ'),('CTO','FINANCE_PNL_READ'),
  ('CSO','HR_LEAVE_READ_SELF'),('CSO','FINANCE_REVENUE_READ'),('CSO','FINANCE_EXPENSE_READ'),('CSO','FINANCE_PNL_READ'),
  ('ADMIN','ADMIN_RBAC_MANAGE'),('ADMIN','ADMIN_AUDIT_READ'),('ADMIN','ADMIN_CONFIG')
) m(role_code,perm_code) on r.code=m.role_code and p.code=m.perm_code;

-- ---------- G. User roles ----------
-- everyone: EMPLOYEE (SELF)
insert into user_roles (employee_id, role_id, scope, organization_id)
select e.id, r.id, 'SELF', e.organization_id from employees e, roles r where r.code='EMPLOYEE';
-- team leaders: TEAM_LEADER scoped to their team
insert into user_roles (employee_id, role_id, scope, scope_ref, organization_id)
select t.leader_id, r.id, 'TEAM', t.id, t.organization_id
from teams t, roles r where r.code='TEAM_LEADER' and t.leader_id is not null;
-- functional roles
insert into user_roles (employee_id, role_id, scope, organization_id)
select e.id, r.id, 'COMPANY', e.organization_id
from employees e join roles r on true
join (values
  ('E001','CEO'),('E002','CTO'),('E003','CSO'),
  ('E024','FINANCE'),('E025','FINANCE'),('E026','FINANCE'),
  ('E027','HR'),('E028','HR'),
  ('E029','ADMIN')
) m(no,role_code) on e.employee_no=m.no and r.code=m.role_code;

-- ---------- H. HR: leave types, policies, balances ----------
insert into leave_types (organization_id, code, name, is_paid, requires_balance)
select o.id, x.code, x.name, x.paid, x.reqbal
from organizations o,
  (values ('ANNUAL','Annual Leave',true,true),
          ('SICK','Sick Leave',true,true),
          ('UNPAID','Unpaid Leave',false,false)) x(code,name,paid,reqbal)
where o.code='OMH_KR';

insert into leave_policies (organization_id, leave_type_id, annual_days, max_carryover, effective_year)
select lt.organization_id, lt.id,
  case lt.code when 'ANNUAL' then 15 when 'SICK' then 10 else 0 end,
  case lt.code when 'ANNUAL' then 5 else 0 end,
  extract(year from current_date)::int
from leave_types lt where lt.code in ('ANNUAL','SICK');

-- balances for current year: everyone entitled; a little already used
insert into leave_balances (organization_id, employee_id, leave_type_id, year, entitled_days, carried_days, used_days, pending_days)
select e.organization_id, e.id, lt.id, extract(year from current_date)::int,
  case lt.code when 'ANNUAL' then 15 when 'SICK' then 10 else 0 end,
  case lt.code when 'ANNUAL' then 2 else 0 end,
  case lt.code when 'ANNUAL' then (abs(hashtext(e.employee_no)) % 6)::numeric else 0 end,
  0
from employees e cross join leave_types lt where lt.code in ('ANNUAL','SICK');

-- ---------- I. Approval flow ----------
insert into approval_flows (organization_id, code, name, request_type)
select id, 'LEAVE_STANDARD', 'Standard leave approval', 'LEAVE'
from organizations where code='OMH_KR';
insert into approval_steps (flow_id, step_no, name, approver_rule)
select f.id, 1, 'Team Leader approval', 'TEAM_LEADER'
from approval_flows f where f.code='LEAVE_STANDARD';

-- ---------- J. Leave requests via the real RPC (creates approval + audit) ----------
-- Lucy (E005) requests tomorrow off -> PENDING, assigned to David (E004).
select app.set_current_employee((select id from employees where employee_no='E005'));
select create_leave_request('ANNUAL', current_date + 1, current_date + 1, '개인 사유',
  '11111111-1111-1111-1111-111111111111');
-- Mina (E006) requests a 3-day block next week -> PENDING, assigned to David.
select app.set_current_employee((select id from employees where employee_no='E006'));
select create_leave_request('ANNUAL', current_date + 7, current_date + 9, '가족 여행',
  '22222222-2222-2222-2222-222222222222');
select app.set_current_employee(null);

-- ============================================================
-- K–N. Finance: COA, ledger, expenses, invoices, snapshots
-- ============================================================
insert into chart_of_accounts (organization_id, code, name, account_type)
select o.id, x.code, x.name, x.t::account_type
from organizations o,
  (values ('1000','Cash','ASSET'),('4000','Room Revenue','REVENUE'),
          ('5000','Cost of Sales','COGS'),('6000','Payroll Expense','EXPENSE'),
          ('6100','Marketing Expense','EXPENSE'),('6200','Rent & Facilities','EXPENSE'),
          ('7000','Other Income','OTHER_INCOME'),('8000','Other Expense','OTHER_EXPENSE'))
    x(code,name,t)
where o.code='OMH_KR';

insert into cost_centers (organization_id, department_id, code, name)
select d.organization_id, d.id, 'CC_'||d.code, d.name||' Cost Center'
from departments d join organizations o on o.id=d.organization_id where o.code='OMH_KR';

insert into customers (organization_id, code, name)
select id,'CUST_AGODA','Agoda' from organizations where code='OMH_KR'
union all select id,'CUST_BOOKING','Booking.com' from organizations where code='OMH_KR'
union all select id,'CUST_EXPEDIA','Expedia' from organizations where code='OMH_KR';
insert into vendors (organization_id, code, name)
select id,'VEND_LINEN','CleanLinen Co' from organizations where code='OMH_KR'
union all select id,'VEND_UTIL','CityUtilities' from organizations where code='OMH_KR';

-- Ledger generator: 12 months, per revenue/expense department, balanced entries.
do $$
declare
  v_org uuid; v_cash uuid; v_rev uuid; v_cogs uuid; v_pay uuid; v_mkt uuid;
  v_periods text[]; v_period text; m int; v_seq int := 0;
  d record; v_dept_rev numeric; v_dept_pay numeric; v_cogs_amt numeric; v_mkt_amt numeric;
  v_je uuid;
  rev_base jsonb := '{"OP":200000,"CONTENT":120000,"GSM":90000,"SCM":70000}';
  pay_base jsonb := '{"CEO_OFFICE":50000,"OP":60000,"CONTENT":40000,"GSM":30000,"SCM":25000,"FIN":20000,"HR":15000,"IT":18000}';
begin
  select id into v_org from organizations where code='OMH_KR';
  select id into v_cash from chart_of_accounts where organization_id=v_org and code='1000';
  select id into v_rev  from chart_of_accounts where organization_id=v_org and code='4000';
  select id into v_cogs from chart_of_accounts where organization_id=v_org and code='5000';
  select id into v_pay  from chart_of_accounts where organization_id=v_org and code='6000';
  select id into v_mkt  from chart_of_accounts where organization_id=v_org and code='6100';

  -- oldest first: 11 months ago .. current month
  select array_agg(to_char(date_trunc('month',current_date) - (n||' months')::interval,'YYYY-MM') order by n desc)
    into v_periods from generate_series(0,11) n;

  for m in 1..array_length(v_periods,1) loop
    v_period := v_periods[m];
    for d in select id, code from departments where organization_id=v_org loop
      -- Revenue (only revenue depts). CONTENT revenue stops growing in last 2 months.
      if rev_base ? d.code then
        v_dept_rev := (rev_base->>d.code)::numeric
          + 1000 * case when d.code='CONTENT' and m > (array_length(v_periods,1)-2)
                        then (array_length(v_periods,1)-2) else m end;
        v_seq := v_seq + 1;
        insert into journal_entries(organization_id,entry_no,entry_date,period,memo,status,source)
          values (v_org,'JE-'||v_period||'-'||lpad(v_seq::text,4,'0'),
                  (v_period||'-15')::date, v_period, d.code||' revenue', 'POSTED','SEED')
          returning id into v_je;
        insert into journal_lines(journal_entry_id,organization_id,account_id,department_id,debit,credit)
          values (v_je,v_org,v_cash,d.id,v_dept_rev,0),
                 (v_je,v_org,v_rev, d.id,0,v_dept_rev);
        -- COGS = 30% of revenue
        v_cogs_amt := round(v_dept_rev*0.30,2);
        v_seq := v_seq + 1;
        insert into journal_entries(organization_id,entry_no,entry_date,period,memo,status,source)
          values (v_org,'JE-'||v_period||'-'||lpad(v_seq::text,4,'0'),
                  (v_period||'-15')::date, v_period, d.code||' COGS','POSTED','SEED')
          returning id into v_je;
        insert into journal_lines(journal_entry_id,organization_id,account_id,department_id,debit,credit)
          values (v_je,v_org,v_cogs,d.id,v_cogs_amt,0),
                 (v_je,v_org,v_cash,d.id,0,v_cogs_amt);
      end if;

      -- Payroll (all depts). CONTENT payroll jumps +15000 in last 2 months (the story).
      if pay_base ? d.code then
        v_dept_pay := (pay_base->>d.code)::numeric + 200*m
          + case when d.code='CONTENT' and m > (array_length(v_periods,1)-2) then 15000 else 0 end;
        v_seq := v_seq + 1;
        insert into journal_entries(organization_id,entry_no,entry_date,period,memo,status,source)
          values (v_org,'JE-'||v_period||'-'||lpad(v_seq::text,4,'0'),
                  (v_period||'-25')::date, v_period, d.code||' payroll','POSTED','SEED')
          returning id into v_je;
        insert into journal_lines(journal_entry_id,organization_id,account_id,department_id,debit,credit)
          values (v_je,v_org,v_pay,d.id,v_dept_pay,0),
                 (v_je,v_org,v_cash,d.id,0,v_dept_pay);
        -- mirror into expenses table (feeds labor-vs-revenue cross-functional query)
        insert into expenses(organization_id,department_id,account_id,category,period,amount,memo,status)
          values (v_org,d.id,v_pay,'PAYROLL',v_period,v_dept_pay,d.code||' payroll','APPROVED');

        -- Marketing (revenue depts only), constant
        if rev_base ? d.code then
          v_mkt_amt := 3000;
          v_seq := v_seq + 1;
          insert into journal_entries(organization_id,entry_no,entry_date,period,memo,status,source)
            values (v_org,'JE-'||v_period||'-'||lpad(v_seq::text,4,'0'),
                    (v_period||'-20')::date, v_period, d.code||' marketing','POSTED','SEED')
            returning id into v_je;
          insert into journal_lines(journal_entry_id,organization_id,account_id,department_id,debit,credit)
            values (v_je,v_org,v_mkt,d.id,v_mkt_amt,0),
                   (v_je,v_org,v_cash,d.id,0,v_mkt_amt);
          insert into expenses(organization_id,department_id,account_id,category,period,amount,memo,status)
            values (v_org,d.id,v_mkt,'MARKETING',v_period,v_mkt_amt,d.code||' marketing','APPROVED');
        end if;
      end if;
    end loop;
  end loop;

  -- Snapshot each period from the same POSTED ledger (reconciliation reference).
  insert into monthly_financial_snapshots(organization_id,period,revenue,cogs,opex,other_income,other_expense,net_profit)
  select v_org, p, c.revenue, c.cogs, c.opex, c.other_income, c.other_expense,
         (c.revenue - c.cogs - c.opex + c.other_income - c.other_expense)
  from unnest(v_periods) p, lateral app.pnl_components(v_org,p) c;
end $$;

-- A few open invoices for AR/AP demos.
insert into invoices (organization_id, customer_id, direction, invoice_no, issue_date, due_date, period, amount, amount_paid, status)
select o.id, c.id, 'INBOUND', 'AR-2026-001', current_date-20, current_date+10, to_char(current_date,'YYYY-MM'), 45000, 0, 'ISSUED'
from organizations o join customers c on c.organization_id=o.id and c.code='CUST_AGODA' where o.code='OMH_KR';
insert into invoices (organization_id, customer_id, direction, invoice_no, issue_date, due_date, period, amount, amount_paid, status)
select o.id, c.id, 'INBOUND', 'AR-2026-002', current_date-40, current_date-5, to_char(current_date,'YYYY-MM'), 30000, 10000, 'PARTIAL'
from organizations o join customers c on c.organization_id=o.id and c.code='CUST_BOOKING' where o.code='OMH_KR';
insert into invoices (organization_id, vendor_id, direction, invoice_no, issue_date, due_date, period, amount, amount_paid, status)
select o.id, v.id, 'OUTBOUND', 'AP-2026-001', current_date-15, current_date+15, to_char(current_date,'YYYY-MM'), 12000, 0, 'ISSUED'
from organizations o join vendors v on v.organization_id=o.id and v.code='VEND_LINEN' where o.code='OMH_KR';

-- Budgets for current month (for variance demo).
insert into budgets (organization_id, department_id, account_id, period, amount)
select d.organization_id, d.id, a.id, to_char(current_date,'YYYY-MM'),
  case a.code when '6000' then 65000 when '6100' then 3500 else 0 end
from departments d
join chart_of_accounts a on a.organization_id=d.organization_id and a.code in ('6000','6100')
join organizations o on o.id=d.organization_id
where o.code='OMH_KR' and d.code in ('OP','CONTENT');

analyze;
