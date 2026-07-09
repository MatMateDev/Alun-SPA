/* ============================================================================
 *  SERVICE · Sincronización con el VPS propio (Postgres + documentos)
 *  Inversiones Alun SpA — Portal interno UAF
 * ----------------------------------------------------------------------------
 *  No modifica el portal: "envuelve" las funciones guardar*() del legacy para
 *  que, además de guardar en localStorage, persistan en el VPS (API REST,
 *  ver /vps-uploads). Los archivos adjuntos (base64) se suben a la carpeta
 *  del cliente en el VPS y en el registro queda solo la ruta (storagePath).
 *  Al iniciar sesión se BAJA el registro compartido de todos los usuarios
 *  autorizados y se fusiona con lo local (gana la versión más reciente).
 *
 *  Debe cargarse DESPUÉS de legacy-app.js y de src/config/firebase.js.
 * ========================================================================== */
(function () {
  "use strict";
  const A = window.Alun;
  if (!A || !A.dataList) { console.error("[sync] API del VPS no inicializada"); return; }

  // Mapeo colección del VPS  →  clave localStorage  →  subcarpeta de documentos
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

  // Recorre el objeto: sube archivos base64 al VPS y los reemplaza por
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

  // Sube (o actualiza) cada elemento local en el VPS. Si el servidor asignó
  // un folio distinto (registro nuevo), lo refleja de vuelta en localStorage.
  async function upsert(entry) {
    let arr;
    try { arr = JSON.parse(localStorage.getItem(entry.key) || "[]"); } catch (e) { return; }
    if (!Array.isArray(arr) || !arr.length) return;
    let cambio = false;
    for (const item of arr) {
      if (!item || !item.id) continue;
      try {
        const clienteId = item.clienteId || (entry.col === "clientes" ? item.id : "_sin_cliente");
        const limpio = await procesarArchivos(JSON.parse(JSON.stringify(item)), clienteId, entry.carpeta);
        const guardado = await A.dataPut(entry.col, item.id, limpio);
        if (guardado && guardado.folio && guardado.folio !== item.folio) { item.folio = guardado.folio; cambio = true; }
      } catch (e) {
        console.warn("[sync] " + entry.col + " id=" + item.id + ":", e.message);
      }
    }
    if (cambio) localStorage.setItem(entry.key, JSON.stringify(arr));
  }

  // BAJADA (pull): trae del VPS lo creado desde cualquier equipo/usuario y lo
  // fusiona con lo local por id (gana la versión con actualizadoEn/creadoEn más
  // reciente). Así todos los correos autorizados ven el registro compartido.
  async function pull() {
    let huboCambios = false;
    for (const entry of MAP) {
      try {
        const remotos = await A.dataList(entry.col);
        if (!remotos.length) continue;
        let local;
        try { local = JSON.parse(localStorage.getItem(entry.key) || "[]"); } catch (e) { local = []; }
        if (!Array.isArray(local)) local = [];
        const porId = {};
        local.forEach((x) => { if (x && x.id) porId[x.id] = x; });
        remotos.forEach((remoto) => {
          const id = remoto.id;
          if (!id) return;
          const loc = porId[id];
          const rMod = remoto.actualizadoEn || remoto.creadoEn || "";
          const lMod = loc ? (loc.actualizadoEn || loc.creadoEn || "") : null;
          if (!loc || (rMod && rMod > lMod)) { porId[id] = remoto; huboCambios = true; }
        });
        const merged = Object.values(porId).sort((a, b) => String(b.creadoEn || "").localeCompare(String(a.creadoEn || "")));
        localStorage.setItem(entry.key, JSON.stringify(merged));
      } catch (e) {
        console.warn("[sync] pull " + entry.col + ":", e.message);
      }
    }
    return huboCambios;
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
  console.info("[sync] Sincronización bidireccional con el VPS activa.");
})();
