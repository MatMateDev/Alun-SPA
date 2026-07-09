# Inversiones Alun SpA — Portal interno UAF

Portal interno de cumplimiento UAF (Ley 19.913 · Circular 62) para la gestión de
clientes (KYC/KYB), operaciones de cambio y registros de transferencias (Regla del Viaje).

El acceso es **privado**: login con **correo + contraseña** (Firebase Authentication),
restringido al personal autorizado. Todos los registros que se agregan quedan
guardados en el **VPS propio** y son visibles para cualquier cuenta autorizada,
desde cualquier equipo.

## Arquitectura (MVC, vanilla JS sin build)

```
.
├── index.html                  # Vista de acceso (login email + contraseña)
├── app.html                    # Vista del portal (protegida por sesión)
├── assets/
│   ├── css/styles.css          # Estilos del portal
│   └── js/legacy-app.js         # Lógica existente del portal (arrays en memoria + localStorage)
├── src/
│   ├── config/firebase.js       # Login (Firebase Auth) + helpers hacia la API del VPS
│   ├── services/vpsDataSync.js  # Sincroniza local ↔ VPS (sube/baja/fusiona por id)
│   ├── models/                  # Capa MVC de referencia (Cliente, Compra, Registro)
│   ├── controllers/             # Orquestación (auth + clientes/compras/registros)
│   └── views/                   # Doc de la capa de vista
├── vps-uploads/                 # Backend en el VPS: Postgres (datos) + documentos + Nginx/TLS
├── db/README.md                 # Esquema de datos (ver /vps-uploads/db/init.sql)
└── inversiones_alun_uaf.html    # HTML monolítico original (referencia histórica)
```

- **Model**: `src/models/*.js` y `assets/js/legacy-app.js` — acceso a datos vía la API del VPS.
- **View**: `index.html`, `app.html`, `assets/css`, `assets/js`.
- **Controller**: `src/controllers/*.js` y autenticación (`window.Alun.auth`).

## Backend

- **Login**: Firebase Authentication (Email/Password). Usuarios creados manualmente
  en la consola; whitelist en `src/config/firebase.js → ALLOWED_EMAILS`.
- **Datos y documentos**: VPS propio (BoxHosting) — ver [`/vps-uploads`](vps-uploads/README.md).
  Postgres guarda los registros (clientes, transferencias, facturas, compras, cuenta,
  archivo de retención UAF, alertas descartadas); el disco guarda los documentos
  adjuntos, referenciados a la carpeta del cliente. El VPS solo **verifica la
  sesión de Firebase** en cada operación — no hay Firestore ni Cloud Storage.
- **Sincronización**: `src/services/vpsDataSync.js` — al iniciar sesión baja el
  registro compartido y lo fusiona con lo local; al guardar, sube al VPS.

## Hosting

Sitio estático desplegado en **Vercel** (deploy automático desde GitHub).
URL: `https://alun-spa.vercel.app` · dominio: `sistema.inversionesalun.cl`.

## Desarrollo local

```bash
npx serve .        # o:  python -m http.server 8000
```
Luego abre http://localhost:8000 (agrégalo en Firebase Auth → Settings → Dominios autorizados).
