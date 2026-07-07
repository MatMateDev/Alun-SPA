/* ============================================================================
 *  SERVICE · Sincronización a Google Cloud (Firestore + Storage)
 *  Inversiones Alun SpA — Portal interno UAF
 * ----------------------------------------------------------------------------
 *  No modifica el portal: "envuelve" las funciones guardar*() del legacy para
 *  que, además de guardar en localStorage, persistan en Firestore. Los archivos
 *  adjuntos (base64) se suben a Cloud Storage en carpetas por cliente y en
 *  Firestore queda solo la ruta (storagePath) + URL.
 *
 *  Debe cargarse DESPUÉS de legacy-app.js y de src/config/firebase.js.
 * ========================================================================== */
(function () {
  "use strict";
  const A = window.Alun;
  if (!A || !A.db) { console.error("[sync] Firebase no inicializado"); return; }

  // Mapeo colección Firestore  →  clave localStorage  →  subcarpeta en Storage
  const MAP = [
    { col: "clientes",  key: "alun_clientes",  carpeta: "ficha",          fn: "guardarClientes" },
    { col: "registros", key: "alun_registros", carpeta: "transferencias", fn: "guardarDatos" },
    { col: "facturas",  key: "alun_facturas",  carpeta: "facturas",       fn: "guardarFacturas" },
    { col: "compras",   key: "alun_compras",   carpeta: "compras",        fn: "guardarCompras" },
    { col: "cuenta",    key: "alun_cuenta",    carpeta: "cuenta",         fn: "guardarCuenta" },
    // Cumplimiento UAF: registros eliminados (retención 5 años) y alertas descartadas (auditoría).
    { col: "archivo",             key: "alun_archivo",             carpeta: "archivo", fn: "guardarArchivo" },
    { col: "alertas_descartadas", key: "alun_alertas_descartadas", carpeta: "alertas", fn: "guardarAlertasDescartadas" },
  ];

  const esArchivo = (o) => o && typeof o === "object" && typeof o.data === "string" && o.data.indexOf("data:") === 0;

  // Recorre el objeto: sube archivos base64 a Storage y los reemplaza por
  // { nombre, storagePath, url }. Deja intacto el resto. Idempotente.
  async function procesarArchivos(obj, clienteId, carpeta) {
    if (!obj || typeof obj !== "object") return obj;
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) obj[i] = await procesarArchivos(obj[i], clienteId, carpeta);
      return obj;
    }
    for (const k of Object.keys(obj)) {
      const val = obj[k];
      if (esArchivo(val)) {
        try {
          const subido = await A.subirDocumento(clienteId, carpeta, val);
          if (subido) obj[k] = { nombre: subido.nombre, storagePath: subido.storagePath, url: subido.url };
        } catch (e) {
          obj[k] = { nombre: val.nombre || "archivo", pendienteSubida: true };
          console.warn("[sync] no se pudo subir archivo:", e.message);
        }
      } else if (val && typeof val === "object") {
        obj[k] = await procesarArchivos(val, clienteId, carpeta);
      }
    }
    return obj;
  }

  async function upsert(entry) {
    let arr;
    try { arr = JSON.parse(localStorage.getItem(entry.key) || "[]"); } catch (e) { return; }
    if (!Array.isArray(arr) || !arr.length) return;
    for (const item of arr) {
      if (!item || !item.id) continue;
      try {
        const clienteId = item.clienteId || (entry.col === "clientes" ? item.id : "_sin_cliente");
        const limpio = await procesarArchivos(JSON.parse(JSON.stringify(item)), clienteId, entry.carpeta);
        await A.db.collection(entry.col).doc(String(item.id)).set(limpio, { merge: true });
      } catch (e) {
        console.warn("[sync] " + entry.col + " id=" + item.id + ":", e.message);
      }
    }
  }

  // Envuelve cada guardar*() para sincronizar tras guardar localmente.
  MAP.forEach((entry) => {
    const original = window[entry.fn];
    if (typeof original !== "function") return;
    window[entry.fn] = function () {
      const r = original.apply(this, arguments);
      upsert(entry).catch((e) => console.warn("[sync]", entry.col, e));
      return r;
    };
  });

  // BAJADA (pull): trae de Firestore lo creado desde cualquier equipo/usuario y lo
  // fusiona con lo local por id (gana la versión con actualizadoEn/creadoEn más
  // reciente). Así todos los correos autorizados ven el registro compartido.
  async function pull() {
    let huboCambios = false;
    for (const entry of MAP) {
      try {
        const snap = await A.db.collection(entry.col).get();
        if (snap.empty) continue;
        let local;
        try { local = JSON.parse(localStorage.getItem(entry.key) || "[]"); } catch (e) { local = []; }
        if (!Array.isArray(local)) local = [];
        const porId = {};
        local.forEach((x) => { if (x && x.id) porId[x.id] = x; });
        snap.docs.forEach((d) => {
          const remoto = d.data();
          const id = remoto.id || d.id;
          const loc = porId[id];
          const rMod = remoto.actualizadoEn || remoto.creadoEn || "";
          const lMod = loc ? (loc.actualizadoEn || loc.creadoEn || "") : null;
          if (!loc || (rMod && rMod > lMod)) { porId[id] = Object.assign({}, remoto, { id }); huboCambios = true; }
        });
        const merged = Object.values(porId).sort((a, b) => String(b.creadoEn || "").localeCompare(String(a.creadoEn || "")));
        localStorage.setItem(entry.key, JSON.stringify(merged));
      } catch (e) {
        console.warn("[sync] pull " + entry.col + ":", e.message);
      }
    }
    return huboCambios;
  }

  // Al iniciar sesión: primero BAJA y fusiona; si llegó algo nuevo recarga la página
  // (una sola vez) para que el portal lo muestre; luego SUBE lo local pendiente.
  A.auth.sesion().then(async (u) => {
    if (!u) return;
    const cambios = await pull();
    if (cambios && !sessionStorage.getItem("alun_pull_ok")) {
      sessionStorage.setItem("alun_pull_ok", "1");
      location.reload();
      return;
    }
    MAP.forEach((entry) => upsert(entry).catch(() => {}));
  });

  A.sync = { ahora: () => MAP.forEach((e) => upsert(e)), pull };
  console.info("[sync] Sincronización bidireccional con Firestore activa.");
})();
