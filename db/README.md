# Base de datos — VPS propio (Postgres)

Los registros de la aplicación (clientes, transferencias, facturas, compras,
cuenta, archivo de retención UAF y alertas descartadas) viven en **Postgres,
en el VPS de BoxHosting** — no en Firestore. El esquema está en
[`/vps-uploads/db/init.sql`](../vps-uploads/db/init.sql) y se aplica solo
(automático) al crear el contenedor `db` la primera vez.

Diseño: una tabla por colección, con el documento completo en **JSONB**
(misma forma que usaba el front) — evita reescribir cada campo como columna
relacional y mantiene intacta la lógica ya construida en `assets/js/legacy-app.js`.

El **login** (correo + contraseña) sigue en **Firebase Authentication**; el
VPS solo verifica esa sesión (token) en cada operación de datos o archivos —
ver [`/vps-uploads/api/server.js`](../vps-uploads/api/server.js).

- `esquema_supabase_alun.sql` y `schema_release1.sql` — esquemas SQL
  relacionales de una etapa anterior (Supabase). Se conservan como
  referencia histórica; el modelo vigente es el JSONB descrito arriba.
