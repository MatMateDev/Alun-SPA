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

  // Empuje inicial: sube a la nube lo que ya exista en localStorage.
  A.auth.sesion().then((u) => {
    if (u) MAP.forEach((entry) => upsert(entry).catch(() => {}));
  });

  A.sync = { ahora: () => MAP.forEach((e) => upsert(e)) };
  console.info("[sync] Sincronización a Firestore activa.");
})();
