# Vistas (View del MVC)

En este MVP la **vista principal del portal es `app.html`** (en la raíz), que contiene
todo el HTML de las secciones: dashboard, clientes, operaciones, registros, facturas,
compras, cuenta, resultados, libro y conciliación.

- El **estilo** vive en [`assets/css/styles.css`](../../assets/css/styles.css).
- La **lógica de render existente** (almacenamiento local del portal) vive en
  [`assets/js/legacy-app.js`](../../assets/js/legacy-app.js).
- La **vista de acceso** (login por código de verificación) es [`index.html`](../../index.html).

Los **controladores** (`src/controllers/`) consumen los **modelos** (`src/models/`),
que a su vez hablan con Supabase a través de la configuración en
[`src/config/supabase.js`](../config/supabase.js).

> Migración progresiva: el portal sigue funcionando con datos locales; las secciones
> del núcleo (clientes, compras, registros) ya disponen de modelos y controladores
> conectados a Supabase para ir reemplazando el almacenamiento local sección por sección.
