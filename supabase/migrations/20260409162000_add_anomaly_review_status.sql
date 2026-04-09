alter table public.expenses
add column if not exists anomaly_review_status text not null default 'unreviewed'
    check (anomaly_review_status in ('unreviewed', 'verified'));

alter table public.expenses
add column if not exists anomaly_reviewed_at timestamptz;

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
    e.anomaly_review_status,
    e.anomaly_reviewed_at,
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
