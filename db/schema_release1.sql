-- ============================================================================
--  INVERSIONES ALUN SpA — Release 1 (MVP)
--  Núcleo operativo: clientes + compras + registros
--  (+ dependencias mínimas: proveedores, facturas — referenciadas por FK)
--  PostgreSQL / Supabase · Ley 19.913 · Circular 62
-- ============================================================================

create extension if not exists "pgcrypto";

-- Función utilitaria: actualizar updated_at automáticamente
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

-- Secuencias para folios correlativos
create sequence if not exists seq_clientes  start 1;
create sequence if not exists seq_compras   start 1;
create sequence if not exists seq_registros start 1;
create sequence if not exists seq_facturas  start 1;

-- ----------------------------------------------------------------------------
--  PROVEEDORES (referenciado por compras)
-- ----------------------------------------------------------------------------
create table if not exists proveedores (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null,
  tipo          text not null default 'otro'
                check (tipo in ('banco','corredora','operador_usdt','otro')),
  contacto      text,
  observaciones text,
  created_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
--  CLIENTES (ficha KYB / KYC) — tabla más importante
-- ----------------------------------------------------------------------------
create table if not exists clientes (
  id                 uuid primary key default gen_random_uuid(),
  folio              text unique not null
                     default ('CL-' || lpad(nextval('seq_clientes')::text, 5, '0')),
  tipo_persona       text not null default 'juridica'
                     check (tipo_persona in ('natural','juridica')),
  razon_social       text,
  rut_comercial      text,
  tipo_sociedad      text,
  fecha_constitucion date,
  giro               text,
  direccion          text,
  comuna             text,
  region             text,
  telefono           text,
  web                text,
  correo             text,
  rl_nombre          text,
  rl_rut             text,
  rl_nacionalidad    text,
  rl_profesion       text,
  rl_domicilio       text,
  rl_correo          text,
  rl_telefono        text,
  pep                boolean not null default false,
  pep_nombre         text,
  pep_cargo          text,
  perfil_proposito   text,
  perfil_paises      text,
  perfil_volumen     numeric(18,2),
  perfil_promedio    numeric(18,2),
  perfil_frecuencia  text,
  perfil_nops        integer,
  perfil_origen      text,
  ddc_nivel          text check (ddc_nivel in ('simplificada','normal','reforzada')),
  ui_kyc_completado  boolean default false,
  ui_cruce_listas    boolean default false,
  ui_listas_resultado text,
  ui_nivel_riesgo    text check (ui_nivel_riesgo in ('bajo','medio','alto')),
  ui_riesgo_fundamento text,
  ui_observaciones   text,
  ui_recepcion       date,
  ui_proxima_revision date,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
drop trigger if exists trg_clientes_updated on clientes;
create trigger trg_clientes_updated before update on clientes
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
--  FACTURAS (referenciado por registros)
-- ----------------------------------------------------------------------------
create table if not exists facturas (
  id         uuid primary key default gen_random_uuid(),
  folio      text unique not null
             default ('FAC-' || lpad(nextval('seq_facturas')::text, 5, '0')),
  cliente_id uuid references clientes(id) on delete set null,
  numero     text,
  fecha      date,
  created_at timestamptz not null default now()
);
create index if not exists idx_fac_cliente on facturas(cliente_id);

-- ----------------------------------------------------------------------------
--  COMPRAS / OPERACIONES
-- ----------------------------------------------------------------------------
create table if not exists compras (
  id              uuid primary key default gen_random_uuid(),
  folio           text unique not null
                  default ('CO-' || lpad(nextval('seq_compras')::text, 6, '0')),
  cliente_id      uuid not null references clientes(id) on delete restrict,
  fecha           date not null default current_date,
  tipo_operacion  text not null default 'compra_div'
                  check (tipo_operacion in ('compra_div','venta_div','liq')),
  moneda_compra   text,
  monto_compra    numeric(18,4),
  moneda_pago     text default 'CLP',
  tipo_cambio     numeric(18,6),
  tc_proveedor    numeric(18,6),
  contraparte     text,
  proveedor_id    uuid references proveedores(id) on delete set null,
  valuta          integer default 0 check (valuta in (0,24,48)),
  comision        numeric(18,4) default 0,
  monto_liquidar      numeric(18,4),
  liq_comision_pct    numeric(7,4),
  liq_tc_venta        numeric(18,6),
  liq_tc_compra       numeric(18,6),
  liq_clp_pago        numeric(18,2),
  liq_contraparte_venta  text,
  liq_contraparte_compra text,
  ganancia_clp    numeric(18,2) default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_compras_cliente on compras(cliente_id);
drop trigger if exists trg_compras_updated on compras;
create trigger trg_compras_updated before update on compras
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
--  REGISTROS (Regla del Viaje)
-- ----------------------------------------------------------------------------
create table if not exists registros (
  id                 uuid primary key default gen_random_uuid(),
  folio              text unique not null
                     default ('OP-' || lpad(nextval('seq_registros')::text, 6, '0')),
  cliente_id         uuid not null references clientes(id) on delete restrict,
  compra_id          uuid references compras(id) on delete set null,
  factura_id         uuid references facturas(id) on delete set null,
  beneficiario_nombre text,
  beneficiario_banco text,
  beneficiario_cuenta text,
  beneficiario_pais  text,
  moneda             text,
  monto              numeric(18,4),
  fecha              date not null default current_date,
  comprobante_hash   text,
  estado_documental  text default 'rojo'
                     check (estado_documental in ('rojo','amarillo','verde')),
  created_at         timestamptz not null default now()
);
create index if not exists idx_reg_cliente on registros(cliente_id);
create index if not exists idx_reg_compra  on registros(compra_id);
create index if not exists idx_reg_factura on registros(factura_id);

-- ============================================================================
--  SEGURIDAD POR FILA (RLS) — solo usuarios autenticados acceden a los datos.
-- ============================================================================
do $$
declare t text;
begin
  foreach t in array array['proveedores','clientes','facturas','compras','registros'] loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists "staff_full_access" on %I;', t);
    execute format($p$create policy "staff_full_access" on %I
                      for all to authenticated using (true) with check (true);$p$, t);
  end loop;
end $$;

-- ============================================================================
--  FIN RELEASE 1
-- ============================================================================
