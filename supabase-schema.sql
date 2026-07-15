-- Pedidos Proveedores PWA - esquema Supabase preparado para pedidos, recepciones y OCR
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
  provider text not null default '',
  file_path text not null,
  file_name text,
  mime_type text,
  file_size bigint,
  ocr_status text not null default 'pending',
  ocr_text text,
  matches jsonb not null default '[]'::jsonb,
  extracted_data jsonb,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

alter table public.invoice_files add column if not exists provider text not null default '';
alter table public.invoice_files add column if not exists file_size bigint;
alter table public.invoice_files add column if not exists ocr_status text not null default 'pending';
alter table public.invoice_files add column if not exists ocr_text text;
alter table public.invoice_files add column if not exists matches jsonb not null default '[]'::jsonb;
alter table public.invoice_files add column if not exists processed_at timestamptz;

create index if not exists orders_created_at_idx on public.orders(created_at desc);
create index if not exists invoice_files_folio_idx on public.invoice_files(folio);
create index if not exists invoice_files_folio_provider_idx on public.invoice_files(folio,provider);

alter table public.orders enable row level security;
alter table public.invoice_files enable row level security;

-- Estas políticas son solo una plantilla de desarrollo. Para publicar la nube,
-- reemplazarlas por Supabase Auth y acceso por usuario/empresa.
insert into storage.buckets (id,name,public)
values ('invoices','invoices',false)
on conflict (id) do nothing;
