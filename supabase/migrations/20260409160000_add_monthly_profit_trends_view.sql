create or replace view public.monthly_profit_trends_v as
with monthly_revenue as (
    select
        date_trunc('month', r.date)::date as month,
        p.org_id,
        r.project_id,
        sum(r.amount) as total_revenue
    from public.revenue r
    inner join public.projects p on p.id = r.project_id
    group by date_trunc('month', r.date), p.org_id, r.project_id
),
monthly_expenses as (
    select
        date_trunc('month', e.date)::date as month,
        p.org_id,
        e.project_id,
        sum(e.amount) as total_expenses
    from public.expenses e
    inner join public.projects p on p.id = e.project_id
    group by date_trunc('month', e.date), p.org_id, e.project_id
),
month_scope as (
    select month, org_id, project_id from monthly_revenue
    union
    select month, org_id, project_id from monthly_expenses
)
select
    ms.month,
    ms.org_id,
    ms.project_id,
    coalesce(mr.total_revenue, 0) as total_revenue,
    coalesce(me.total_expenses, 0) as total_expenses,
    coalesce(mr.total_revenue, 0) - coalesce(me.total_expenses, 0) as net_profit
from month_scope ms
left join monthly_revenue mr
    on mr.month = ms.month
    and mr.org_id = ms.org_id
    and mr.project_id = ms.project_id
left join monthly_expenses me
    on me.month = ms.month
    and me.org_id = ms.org_id
    and me.project_id = ms.project_id;
