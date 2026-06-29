# Inversiones Alun SpA — Portal interno UAF

Portal interno de cumplimiento UAF (Ley 19.913 · Circular 62) para la gestión de
clientes (KYC/KYB), operaciones de cambio y registros de transferencias (Regla del Viaje).

El acceso es **privado**: solo se entra mediante un **código de verificación** enviado
al correo autorizado (Supabase Email OTP).

## Arquitectura (MVC, vanilla JS sin build)

```
.
├── index.html                  # Vista de acceso (login por código OTP)
├── app.html                    # Vista del portal (protegida por sesión)
├── assets/
│   ├── css/styles.css          # Estilos del portal
│   └── js/legacy-app.js         # Lógica existente del portal (almacenamiento local)
├── src/
│   ├── config/supabase.js       # Cliente Supabase + whitelist de correos
│   ├── models/                  # Acceso a datos (Cliente, Compra, Registro)
│   ├── controllers/             # Orquestación (auth, clientes, compras, registros)
│   └── views/                   # Doc de la capa de vista
├── db/schema_release1.sql       # Esquema del Release 1 (núcleo)
├── esquema_supabase_alun.sql    # Esquema completo (referencia, 16 tablas)
└── inversiones_alun_uaf.html    # HTML monolítico original (referencia histórica)
```

- **Model**: `src/models/*.js` — CRUD contra Supabase (`window.Alun.models.*`).
- **View**: `index.html`, `app.html`, `assets/css`, `assets/js`.
- **Controller**: `src/controllers/*.js` — lógica de aplicación (`window.Alun.controllers.*`)
  y autenticación (`window.Alun.auth`).

## Release 1 (MVP)

Tablas creadas en Supabase: `clientes`, `compras`, `registros` (+ `proveedores`,
`facturas` por integridad referencial). RLS activado: solo usuarios autenticados leen/escriben.

## Acceso por código de verificación

1. El usuario ingresa su correo en `index.html`.
2. Solo si está en la whitelist (`src/config/supabase.js → ALLOWED_EMAILS`) Supabase
   envía un código de 6 dígitos al correo.
3. El usuario ingresa el código y entra a `app.html`.
4. `app.html` está protegido: sin sesión válida y autorizada, redirige al login.

Correo autorizado actual: `felgonzpu@gmail.com`.

## Desarrollo local

Sírvelo por HTTP (no `file://`, para que la sesión persista correctamente):

```bash
npx serve .        # o:  python -m http.server 8000
```

Luego abre http://localhost:8000

## Proyecto Supabase

- URL: `https://qywhxkjherhwbgcaddna.supabase.co`
- Clave publicable (segura para el navegador): ver `src/config/supabase.js`.
