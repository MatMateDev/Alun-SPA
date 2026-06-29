-- ============================================================================
--  INVERSIONES ALUN SpA — Modelo de datos (PostgreSQL / Supabase)
--  Sistema de cumplimiento UAF · Ley 19.913 · Circular 62
-- ----------------------------------------------------------------------------
--  CÓMO USAR:
--   1. En Supabase, abra SQL Editor → New query → pegue TODO este archivo → Run.
--   2. En Storage, cree un bucket PRIVADO llamado "documentos" (para los archivos
--      KYC, comprobantes y facturas). La tabla "documentos" guarda solo la ruta.
--   3. En Authentication → Providers, habilite Email y cree los usuarios del
--      personal autorizado. La seguridad por fila (RLS) ya queda activada abajo:
--      solo usuarios autenticados acceden a los datos.
--   4. Ajuste las políticas si necesita roles (ej. solo el EPD ve "uso interno").
-- ============================================================================

-- Extensión para UUID (en Supabase suele venir activa; por si acaso)
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
--  Función utilitaria: actualizar updated_at automáticamente
-- ----------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

-- Secuencias para folios correlativos
create sequence if not exists seq_clientes    start 1;
create sequence if not exists seq_compras     start 1;
create sequence if not exists seq_registros   start 1;
create sequence if not exists seq_facturas    start 1;
create sequence if not exists seq_movimientos start 1;
create sequence if not exists seq_cuenta      start 1;

-- ============================================================================
--  1. PROVEEDORES (bancos, corredoras, operadores de USDT)
-- ============================================================================
create table proveedores (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null,
  tipo          text not null default 'otro'
                check (tipo in ('banco','corredora','operador_usdt','otro')),
  contacto      text,
  observaciones text,
  created_at    timestamptz not null default now()
);

-- ============================================================================
--  2. CUENTAS BANCARIAS DE LA EMPRESA
-- ============================================================================
create table cuentas_bancarias (
  id         uuid primary key default gen_random_uuid(),
  banco      text not null,
  numero     text not null,
  tipo       text default 'Corriente',
  moneda     text not null default 'CLP',
  alias      text,
  created_at timestamptz not null default now()
);

-- ============================================================================
--  3. CLIENTES (ficha KYB / KYC)
-- ============================================================================
create table clientes (
  id                 uuid primary key default gen_random_uuid(),
  folio              text unique not null
                     default ('CL-' || lpad(nextval('seq_clientes')::text, 5, '0')),
  tipo_persona       text not null default 'juridica'
                     check (tipo_persona in ('natural','juridica')),
  -- Empresa
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
  -- Representante legal
  rl_nombre          text,
  rl_rut             text,
  rl_nacionalidad    text,
  rl_profesion       text,
  rl_domicilio       text,
  rl_correo          text,
  rl_telefono        text,
  -- PEP
  pep                boolean not null default false,
  pep_nombre         text,
  pep_cargo          text,
  -- Perfil transaccional
  perfil_proposito   text,
  perfil_paises      text,
  perfil_volumen     numeric(18,2),
  perfil_promedio    numeric(18,2),
  perfil_frecuencia  text,
  perfil_nops        integer,
  perfil_origen      text,
  -- Debida Diligencia y uso interno
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
create trigger trg_clientes_updated before update on clientes
  for each row execute function set_updated_at();

-- ============================================================================
--  4. BENEFICIARIOS FINALES (hijos de cliente)
-- ============================================================================
create table beneficiarios_finales (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid not null references clientes(id) on delete cascade,
  nombre         text,
  rut            text,
  nacionalidad   text,
  participacion  numeric(5,2),
  tipo           text check (tipo in ('directa','indirecta')),
  kyc_completado boolean default false,
  created_at     timestamptz not null default now()
);
create index idx_bf_cliente on beneficiarios_finales(cliente_id);

-- ============================================================================
--  5. DESTINATARIOS HABITUALES (hijos de cliente) — registro manual opcional
-- ============================================================================
create table destinatarios_habituales (
  id          uuid primary key default gen_random_uuid(),
  cliente_id  uuid not null references clientes(id) on delete cascade,
  nombre      text,
  identificacion text,
  pais        text,
  banco       text,
  cuenta      text,
  created_at  timestamptz not null default now()
);
create index idx_dh_cliente on destinatarios_habituales(cliente_id);

-- ============================================================================
--  6. FACTURAS (agrupan una o varias transferencias)
-- ============================================================================
create table facturas (
  id         uuid primary key default gen_random_uuid(),
  folio      text unique not null
             default ('FAC-' || lpad(nextval('seq_facturas')::text, 5, '0')),
  cliente_id uuid references clientes(id) on delete set null,
  numero     text,
  fecha      date,
  created_at timestamptz not null default now()
);
create index idx_fac_cliente on facturas(cliente_id);

-- ============================================================================
--  7. COMPRAS / OPERACIONES (compra, venta, liquidación) con ganancia
-- ============================================================================
create table compras (
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
  tipo_cambio     numeric(18,6),   -- TC cliente
  tc_proveedor    numeric(18,6),
  contraparte     text,
  proveedor_id    uuid references proveedores(id) on delete set null,
  valuta          integer default 0 check (valuta in (0,24,48)),
  comision        numeric(18,4) default 0,
  -- Liquidación / conversión
  monto_liquidar      numeric(18,4),
  liq_comision_pct    numeric(7,4),
  liq_tc_venta        numeric(18,6),
  liq_tc_compra       numeric(18,6),
  liq_clp_pago        numeric(18,2),
  liq_contraparte_venta  text,
  liq_contraparte_compra text,
  -- Resultado
  ganancia_clp    numeric(18,2) default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index idx_compras_cliente on compras(cliente_id);
create trigger trg_compras_updated before update on compras
  for each row execute function set_updated_at();

-- ============================================================================
--  8. ABONOS (pagos del cliente a una operación — hijos de compra)
-- ============================================================================
create table abonos (
  id         uuid primary key default gen_random_uuid(),
  compra_id  uuid not null references compras(id) on delete cascade,
  fecha      date not null default current_date,
  monto      numeric(18,4) not null,
  medio      text,
  tipo       text default 'normal',  -- normal | cuenta_aplicada | a_cuenta
  created_at timestamptz not null default now()
);
create index idx_abonos_compra on abonos(compra_id);

-- ============================================================================
--  9. CUENTA DEL CLIENTE (abonos en cuenta antes de operar)
-- ============================================================================
create table cuenta_movimientos (
  id              uuid primary key default gen_random_uuid(),
  folio           text unique not null
                  default ('AC-' || lpad(nextval('seq_cuenta')::text, 6, '0')),
  cliente_id      uuid not null references clientes(id) on delete restrict,
  fecha           date not null default current_date,
  tipo            text not null default 'deposito'
                  check (tipo in ('deposito','retiro','aplicado')),
  monto           numeric(18,4) not null,
  moneda          text not null default 'CLP',
  medio           text,
  banco_cuenta_id uuid references cuentas_bancarias(id) on delete set null,
  ref_compra_id   uuid references compras(id) on delete set null,
  observacion     text,
  conciliado      boolean not null default false,
  created_at      timestamptz not null default now()
);
create index idx_cuenta_cliente on cuenta_movimientos(cliente_id);

-- ============================================================================
--  10. TRANSFERENCIAS (Regla del Viaje)
-- ============================================================================
create table registros (
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
  comprobante_hash   text,        -- hash / SWIFT
  estado_documental  text default 'rojo'
                     check (estado_documental in ('rojo','amarillo','verde')),
  created_at         timestamptz not null default now()
);
create index idx_reg_cliente on registros(cliente_id);
create index idx_reg_compra  on registros(compra_id);
create index idx_reg_factura on registros(factura_id);

-- ============================================================================
--  11. LIBRO DE CAJA (ingresos / egresos)
-- ============================================================================
create table movimientos (
  id               uuid primary key default gen_random_uuid(),
  folio            text unique not null
                   default ('MOV-' || lpad(nextval('seq_movimientos')::text, 6, '0')),
  fecha            date not null default current_date,
  tipo             text not null check (tipo in ('ingreso','egreso')),
  categoria        text,
  contraparte_tipo text check (contraparte_tipo in ('cliente','proveedor','empresa')),
  cliente_id       uuid references clientes(id) on delete set null,
  proveedor_id     uuid references proveedores(id) on delete set null,
  contraparte_nombre text,
  monto            numeric(18,4) not null,
  moneda           text not null default 'CLP',
  descripcion      text,
  conciliado       boolean not null default false,
  created_at       timestamptz not null default now()
);
create index idx_mov_fecha on movimientos(fecha);

-- ============================================================================
--  12. CONCILIACIÓN BANCARIA (líneas de cartola importada)
-- ============================================================================
create table cartola_lineas (
  id              uuid primary key default gen_random_uuid(),
  banco_cuenta_id uuid references cuentas_bancarias(id) on delete set null,
  fecha           date,
  descripcion     text,
  monto           numeric(18,2) not null,   -- con signo (+ abono / - cargo)
  conciliado      boolean not null default false,
  match_origen    text,   -- 'libro' | 'cuenta'
  match_id        uuid,
  created_at      timestamptz not null default now()
);
create index idx_cartola_cuenta on cartola_lineas(banco_cuenta_id);

-- ============================================================================
--  13. DOCUMENTOS (metadatos; los archivos van al Storage de Supabase)
-- ============================================================================
create table documentos (
  id           uuid primary key default gen_random_uuid(),
  entidad      text not null check (entidad in ('cliente','registro','compra','cuenta')),
  entidad_id   uuid not null,
  tipo         text,        -- cedula_rl, constitucion, vigencia, erut, comprobante, factura, ...
  nombre       text,        -- nombre original del archivo
  storage_path text not null, -- ruta dentro del bucket "documentos"
  mime         text,
  created_at   timestamptz not null default now()
);
create index idx_doc_entidad on documentos(entidad, entidad_id);

-- ============================================================================
--  14. UMBRALES DE ALERTA Y CONFIGURACIÓN
-- ============================================================================
create table umbrales (
  moneda text primary key,
  monto  numeric(18,2) not null default 0
);

create table configuracion (
  clave text primary key,
  valor jsonb
);
insert into configuracion (clave, valor)
  values ('respaldo_automatico', 'true'::jsonb)
  on conflict (clave) do nothing;

-- ============================================================================
--  15. CONTACTOS DE LA LANDING (formulario público del sitio web)
-- ============================================================================
create table contactos_landing (
  id         uuid primary key default gen_random_uuid(),
  nombre     text,
  correo     text,
  telefono   text,
  mensaje    text,
  origen     text default 'landing',
  created_at timestamptz not null default now()
);

-- ============================================================================
--  SEGURIDAD POR FILA (RLS) — SOLO USUARIOS AUTENTICADOS ACCEDEN A LOS DATOS
--  Base: cualquier usuario del personal autenticado tiene acceso completo.
--  Refine luego por roles si lo necesita (ej. uso interno solo para el EPD).
-- ============================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'proveedores','cuentas_bancarias','clientes','beneficiarios_finales',
    'destinatarios_habituales','facturas','compras','abonos','cuenta_movimientos',
    'registros','movimientos','cartola_lineas','documentos','umbrales',
    'configuracion','contactos_landing'
  ] loop
    execute format('alter table %I enable row level security;', t);
    execute format($p$create policy "staff_full_access" on %I
                      for all to authenticated using (true) with check (true);$p$, t);
  end loop;
end $$;

-- EXCEPCIÓN: la landing es pública y debe poder INSERTAR contactos sin login.
-- (No puede leerlos; solo el personal autenticado los lee, por la política de arriba.)
create policy "landing_public_insert" on contactos_landing
  for insert to anon with check (true);

-- ============================================================================
--  FIN DEL ESQUEMA
-- ============================================================================
