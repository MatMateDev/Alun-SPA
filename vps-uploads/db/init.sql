-- ============================================================================
--  Inversiones Alun SpA — Base de datos en el VPS (Postgres)
--  Reemplaza a Firestore: TODOS los registros viven aquí. El login sigue
--  en Firebase Auth; el VPS solo verifica la sesión (mismo patrón que las
--  subidas de archivos). Se ejecuta automáticamente al crear el contenedor
--  "db" por primera vez (docker-entrypoint-initdb.d).
-- ----------------------------------------------------------------------------
--  Diseño: una tabla por colección, con el documento completo en JSONB
--  (misma forma que usaba el front con Firestore) + folio/fecha indexados
--  para listar rápido. Evita reescribir cada campo como columna relacional
--  y mantiene 1:1 la lógica ya construida en el front.
-- ============================================================================

create table if not exists clientes (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists registros (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists facturas (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists compras (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists cuenta (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Retención 5 años (UAF): registros eliminados, con motivo/usuario/fecha.
create table if not exists archivo (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Auditoría de alertas (umbral / fraccionamiento) descartadas con justificación.
create table if not exists alertas_descartadas (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Folios correlativos (CL-00001, OP-000001, ...). Incremento atómico.
create table if not exists counters (
  entity text primary key,
  n integer not null default 0
);

-- Módulos restantes (servidor-único: NADA vive en el navegador)
create table if not exists movimientos (
  id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists proveedores (
  id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists cuentas_bancarias (
  id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists cartola (
  id text primary key, data jsonb not null, updated_at timestamptz not null default now());
-- Configuración del portal (umbrales, logo, correlativo local): un solo documento id='config'
create table if not exists configuracion (
  id text primary key, data jsonb not null, updated_at timestamptz not null default now());
