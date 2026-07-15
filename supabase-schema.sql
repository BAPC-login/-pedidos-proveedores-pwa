-- Pedidos Proveedores PWA - esquema inicial Supabase
create table if not exists public.orders (
  folio text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  company text,
  status text not null default 'pending',
  total_items integer not null default 0,
  providers jsonb not null default '[]'::jsonb,
  rows jsonb not null default '[]'::jsonb
);

create table if not exists public.invoice_files (
  id bigint generated always as identity primary key,
  folio text not null references public.orders(folio) on delete cascade,
  file_path text not null,
  file_name text,
  mime_type text,
  created_at timestamptz not null default now(),
  extracted_data jsonb
);

create index if not exists orders_created_at_idx on public.orders(created_at desc);
create index if not exists invoice_files_folio_idx on public.invoice_files(folio);

alter table public.orders enable row level security;
alter table public.invoice_files enable row level security;

-- Para la primera etapa privada de un solo usuario. Antes de uso multiusuario,
-- reemplazar estas políticas por autenticación Supabase Auth.
create policy "orders anon access" on public.orders for all to anon using (true) with check (true);
create policy "invoice anon access" on public.invoice_files for all to anon using (true) with check (true);

insert into storage.buckets (id,name,public)
values ('invoices','invoices',false)
on conflict (id) do nothing;

create policy "invoice storage anon insert" on storage.objects
for insert to anon with check (bucket_id='invoices');
create policy "invoice storage anon read" on storage.objects
for select to anon using (bucket_id='invoices');
