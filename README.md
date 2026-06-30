# Inversiones Alun SpA — Portal interno UAF

Portal interno de cumplimiento UAF (Ley 19.913 · Circular 62) para la gestión de
clientes (KYC/KYB), operaciones de cambio y registros de transferencias (Regla del Viaje).

El acceso es **privado**: login con **correo + contraseña** (Firebase Authentication),
restringido al personal autorizado.

## Arquitectura (MVC, vanilla JS sin build) sobre Google Cloud / Firebase

```
.
├── index.html                  # Vista de acceso (login email + contraseña)
├── app.html                    # Vista del portal (protegida por sesión)
├── assets/
│   ├── css/styles.css          # Estilos del portal
│   └── js/legacy-app.js         # Lógica existente del portal (almacenamiento local)
├── src/
│   ├── config/firebase.js       # Init de Firebase + whitelist de correos
│   ├── models/                  # Acceso a datos en Firestore (Cliente, Compra, Registro)
│   ├── controllers/             # Orquestación (auth + clientes/compras/registros)
│   └── views/                   # Doc de la capa de vista
├── db/firestore.rules           # Reglas de seguridad de Firestore
└── inversiones_alun_uaf.html    # HTML monolítico original (referencia histórica)
```

- **Model**: `src/models/*.js` — CRUD contra Firestore (`window.Alun.models.*`).
- **View**: `index.html`, `app.html`, `assets/css`, `assets/js`.
- **Controller**: `src/controllers/*.js` y autenticación (`window.Alun.auth`).

## Backend: Firebase (Google Cloud)

- **Auth**: Firebase Authentication (Email/Password). Usuarios creados manualmente
  en la consola; whitelist en `src/config/firebase.js → ALLOWED_EMAILS`.
- **Datos**: Cloud Firestore. Colecciones `clientes`, `compras`, `registros` (+ `counters`
  para los folios correlativos CL-/CO-/OP-). Proyecto: `inversiones-alun-spa`.
- **Reglas**: `db/firestore.rules` — solo usuarios autenticados y autorizados.

## Hosting

Sitio estático desplegado en **Vercel** (deploy automático desde GitHub).
URL: `https://alun-spa.vercel.app` · dominio: `sistema.inversionesalun.cl`.

## Desarrollo local

```bash
npx serve .        # o:  python -m http.server 8000
```
Luego abre http://localhost:8000 (agrégalo en Firebase Auth → Settings → Dominios autorizados).
