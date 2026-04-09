create extension if not exists pgcrypto with schema extensions;

create table if not exists public.organizations (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    created_at timestamptz not null default now()
);

create table if not exists public.users (
    id uuid primary key default gen_random_uuid(),
    org_id uuid references public.organizations(id) on delete cascade,
    full_name text not null,
    email text unique not null,
    role text default 'technician'
);

create table if not exists public.projects (
    id uuid primary key default gen_random_uuid(),
    org_id uuid references public.organizations(id) on delete cascade,
    name text not null,
    budget numeric(15, 2) not null default 0,
    status text check (status in ('active', 'completed', 'on_hold')) default 'active',
    start_date date default current_date
);

create table if not exists public.revenue (
    id uuid primary key default gen_random_uuid(),
    project_id uuid references public.projects(id) on delete cascade,
    amount numeric(15, 2) not null,
    description text,
    date timestamptz default now()
);

create table if not exists public.expenses (
    id uuid primary key default gen_random_uuid(),
    project_id uuid references public.projects(id) on delete cascade,
    user_id uuid references public.users(id) on delete set null,
    amount numeric(15, 2) not null,
    category text not null,
    date timestamptz default now()
);

create index if not exists idx_users_org_id on public.users(org_id);
create index if not exists idx_projects_org_id on public.projects(org_id);
create index if not exists idx_revenue_project_id on public.revenue(project_id);
create index if not exists idx_revenue_date on public.revenue(date);
create index if not exists idx_expenses_project_id on public.expenses(project_id);
create index if not exists idx_expenses_user_id on public.expenses(user_id);
create index if not exists idx_expenses_date on public.expenses(date);
create index if not exists idx_expenses_category on public.expenses(category);
