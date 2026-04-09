create or replace view public.expense_anomalies_v as
with category_stats as (
    select
        category,
        avg(amount) as avg_amount
    from public.expenses
    group by category
),
equipment_stats as (
    select avg(amount) as equipment_avg
    from public.expenses
    where category = 'Equipment'
),
duplicate_candidates as (
    select
        e.id,
        count(*) over (
            partition by e.user_id, e.project_id, e.category, e.amount, timezone('utc', e.date)::date
        ) as dup_count
    from public.expenses e
)
select
    e.id as expense_id,
    e.project_id,
    p.org_id,
    o.name as org_name,
    e.user_id,
    u.full_name as technician_name,
    p.name as project_name,
    e.date,
    e.category,
    e.amount,
    case
        when e.category not in ('Flight', 'Hotel', 'Meals', 'Equipment') then true
        when dc.dup_count > 1 then true
        when e.category = 'Equipment'
            and (
                e.amount > 5000
                or (
                    coalesce(es.equipment_avg, 0) > 0
                    and e.amount > (es.equipment_avg * 3)
                )
            ) then true
        when coalesce(cs.avg_amount, 0) > 0 and e.amount > (cs.avg_amount * 3) then true
        else false
    end as anomaly_flag,
    case
        when e.category not in ('Flight', 'Hotel', 'Meals', 'Equipment') then 'unauthorized_category'
        when dc.dup_count > 1 then 'duplicate'
        when e.category = 'Equipment'
            and (
                e.amount > 5000
                or (
                    coalesce(es.equipment_avg, 0) > 0
                    and e.amount > (es.equipment_avg * 3)
                )
            ) then 'large_equipment'
        when coalesce(cs.avg_amount, 0) > 0 and e.amount > (cs.avg_amount * 3) then 'category_outlier'
        else null
    end as anomaly_type,
    case
        when e.category not in ('Flight', 'Hotel', 'Meals', 'Equipment')
            then 'Expense logged under an unauthorized category (' || e.category || '). Authorized categories are Flight, Hotel, Meals, and Equipment.'
        when dc.dup_count > 1
            then 'Duplicate expense: same technician, project, category, amount, and date appears ' || dc.dup_count || ' times.'
        when e.category = 'Equipment'
            and (
                e.amount > 5000
                or (
                    coalesce(es.equipment_avg, 0) > 0
                    and e.amount > (es.equipment_avg * 3)
                )
            )
            then 'Large equipment purchase worth $' || round(e.amount::numeric, 2) || ' exceeds the fixed threshold or the normal equipment baseline.'
        when coalesce(cs.avg_amount, 0) > 0 and e.amount > (cs.avg_amount * 3)
            then 'Category outlier: amount is more than 3x the category average of $' || round(cs.avg_amount::numeric, 2) || '.'
        else null
    end as anomaly_reason
from public.expenses e
left join public.projects p on p.id = e.project_id
left join public.organizations o on o.id = p.org_id
left join public.users u on u.id = e.user_id
left join category_stats cs on cs.category = e.category
left join duplicate_candidates dc on dc.id = e.id
cross join equipment_stats es;

create or replace view public.project_financials_v as
select
    p.id as project_id,
    p.org_id,
    p.name as project_name,
    p.budget,
    p.status,
    p.start_date,
    coalesce(rev.total_revenue, 0) as total_revenue,
    coalesce(exp.total_expenses, 0) as total_expenses,
    coalesce(rev.total_revenue, 0) - coalesce(exp.total_expenses, 0) as net_profit,
    case
        when coalesce(rev.total_revenue, 0) = 0 then 0
        else round((((coalesce(rev.total_revenue, 0) - coalesce(exp.total_expenses, 0)) / rev.total_revenue) * 100)::numeric, 2)
    end as margin_pct,
    coalesce(exp.travel_spend, 0) as travel_spend,
    coalesce(exp.equipment_spend, 0) as equipment_spend,
    coalesce(anom.anomaly_count, 0) as anomaly_count
from public.projects p
left join (
    select
        project_id,
        sum(amount) as total_revenue
    from public.revenue
    group by project_id
) rev on rev.project_id = p.id
left join (
    select
        project_id,
        sum(amount) as total_expenses,
        sum(case when category in ('Flight', 'Hotel', 'Meals') then amount else 0 end) as travel_spend,
        sum(case when category = 'Equipment' then amount else 0 end) as equipment_spend
    from public.expenses
    group by project_id
) exp on exp.project_id = p.id
left join (
    select
        project_id,
        count(*) as anomaly_count
    from public.expense_anomalies_v
    where anomaly_flag = true
    group by project_id
) anom on anom.project_id = p.id;

create or replace view public.org_financials_v as
select
    o.id as org_id,
    o.name as org_name,
    count(distinct pf.project_id) as project_count,
    coalesce(sum(pf.total_revenue), 0) as total_revenue,
    coalesce(sum(pf.total_expenses), 0) as total_expenses,
    coalesce(sum(pf.net_profit), 0) as net_profit,
    case
        when coalesce(sum(pf.total_revenue), 0) = 0 then 0
        else round(((sum(pf.net_profit) / sum(pf.total_revenue)) * 100)::numeric, 2)
    end as margin_pct,
    coalesce(sum(pf.travel_spend), 0) as travel_spend,
    coalesce(sum(pf.equipment_spend), 0) as equipment_spend,
    coalesce(sum(pf.anomaly_count), 0) as anomaly_count
from public.organizations o
left join public.project_financials_v pf on pf.org_id = o.id
group by o.id, o.name;

create or replace view public.monthly_travel_trends_v as
select
    date_trunc('month', e.date)::date as month,
    p.org_id,
    p.id as project_id,
    count(distinct r.id) as survey_count,
    sum(case when e.category in ('Flight', 'Hotel', 'Meals') then e.amount else 0 end) as total_travel_spend,
    case
        when count(distinct r.id) = 0 then 0
        else round((
            sum(case when e.category in ('Flight', 'Hotel', 'Meals') then e.amount else 0 end) / count(distinct r.id)
        )::numeric, 2)
    end as avg_travel_cost_per_survey
from public.expenses e
inner join public.projects p on p.id = e.project_id
left join public.revenue r
    on r.project_id = p.id
    and date_trunc('month', r.date) = date_trunc('month', e.date)
group by date_trunc('month', e.date), p.org_id, p.id;

