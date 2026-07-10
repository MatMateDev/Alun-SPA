/* ============================================================================
 *  SERVICE · Sincronización con el VPS propio (Postgres + documentos)
 *  Inversiones Alun SpA — Portal interno UAF
 * ----------------------------------------------------------------------------
 *  Modelo: el VPS manda; el navegador es solo caché.
 *  - Cada guardar*() del legacy empuja al servidor SOLO los registros que
 *    cambiaron (huella por id) y muestra un banner con el resultado.
 *  - Cada eliminar*() propaga la eliminación al servidor (cola con reintento);
 *    sin esto, el pull "revive" lo borrado.
 *  - Al iniciar sesión se baja el registro compartido y se fusiona por id
 *    (gana la versión con actualizadoEn más reciente).
 *  - Los adjuntos base64 se suben a la carpeta del cliente en el VPS; si una
 *    subida falla, el registro queda "sucio" y se reintenta (no se pierde).
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

  // Funciones eliminar*() del legacy cuya eliminación debe propagarse al servidor.
  const DEL_MAP = [
    { fn: "eliminarCliente",   col: "clientes",  key: "alun_clientes" },
    { fn: "eliminarRegistro",  col: "registros", key: "alun_registros" },
    { fn: "eliminarFactura",   col: "facturas",  key: "alun_facturas" },
    { fn: "eliminarCompra",    col: "compras",   key: "alun_compras" },
    { fn: "eliminarMovCuenta", col: "cuenta",    key: "alun_cuenta" },
  ];

  const esArchivo = (o) => o && typeof o === "object" && typeof o.data === "string" && o.data.indexOf("data:") === 0;

  // ── Huella por registro: solo se empuja lo que cambió desde el último push ──
  function huella(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return String(h);
  }
  function leerSynced(col) {
    try { return JSON.parse(localStorage.getItem("alun_synced_" + col) || "{}") || {}; } catch (e) { return {}; }
  }
  function guardarSynced(col, m) {
    try { localStorage.setItem("alun_synced_" + col, JSON.stringify(m)); } catch (e) {}
  }

  // ── Cola de eliminaciones pendientes de propagar al servidor ────────────────
  function leerColaDel() {
    try { return JSON.parse(localStorage.getItem("alun_pend_del") || "[]") || []; } catch (e) { return []; }
  }
  function guardarColaDel(q) {
    try { localStorage.setItem("alun_pend_del", JSON.stringify(q)); } catch (e) {}
  }

  // ── Indicador visible del estado de guardado en el servidor ────────────────
  let bannerEl = null, bannerTimer = null, bannerTipo = null;
  function banner(texto, tipo) {
    if (!bannerEl) {
      bannerEl = document.createElement("div");
      bannerEl.id = "sync-banner";
      document.body.appendChild(bannerEl);
    }
    clearTimeout(bannerTimer);
    const estilos = {
      info: "background:#E8ECE3;color:#3E4D5C;",
      ok:   "background:#EAF3DE;color:#27500A;",
      warn: "background:#FAEEDA;color:#633806;",
      err:  "background:#FCEBEB;color:#791F1F;",
    };
    bannerEl.style.cssText = "position:fixed;bottom:16px;right:16px;z-index:9999;padding:10px 14px;" +
      "border-radius:10px;font:600 13px 'Hanken Grotesk',system-ui,sans-serif;box-shadow:0 4px 16px rgba(44,54,64,.18);" +
      "display:block;max-width:340px;" + (estilos[tipo] || estilos.info);
    bannerEl.textContent = texto;
    bannerTipo = tipo;
    if (tipo !== "err") bannerTimer = setTimeout(() => { bannerEl.style.display = "none"; bannerTipo = null; }, tipo === "warn" ? 6000 : 2500);
  }

  // Reintento automático mientras queden cambios sin llegar al servidor.
  let retryTimer = null;
  function programarReintento() {
    if (retryTimer) return;
    retryTimer = setTimeout(() => { retryTimer = null; empujarTodo(false); }, 30000);
  }

  // Recorre el objeto: sube archivos base64 al VPS y los reemplaza por
  // { nombre, storagePath }. st.fallos cuenta las subidas que fallaron.
  async function procesarArchivos(obj, clienteId, carpeta, st) {
    if (!obj || typeof obj !== "object") return obj;
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) obj[i] = await procesarArchivos(obj[i], clienteId, carpeta, st);
      return obj;
    }
    for (const k of Object.keys(obj)) {
      const val = obj[k];
      if (esArchivo(val)) {
        try {
          const subido = await A.subirDocumento(clienteId, carpeta, val);
          if (!subido) throw new Error("sin sesión");
          obj[k] = { nombre: subido.nombre, storagePath: subido.storagePath };
        } catch (e) {
          st.fallos++;
          obj[k] = { nombre: val.nombre || "archivo", pendienteSubida: true };
          console.warn("[sync] no se pudo subir archivo:", e.message);
        }
      } else if (val && typeof val === "object") {
        obj[k] = await procesarArchivos(val, clienteId, carpeta, st);
      }
    }
    return obj;
  }

  // Sube al VPS los registros que cambiaron desde el último push exitoso.
  // Devuelve la cantidad de registros que NO lograron quedar guardados.
  async function upsert(entry) {
    let arr;
    try { arr = JSON.parse(localStorage.getItem(entry.key) || "[]"); } catch (e) { return 0; }
    if (!Array.isArray(arr) || !arr.length) return 0;
    const synced = leerSynced(entry.col);
    let errores = 0;
    for (const item of arr) {
      if (!item || !item.id) continue;
      const antes = JSON.stringify(item);
      if (synced[item.id] === huella(antes)) continue; // sin cambios desde el último push
      try {
        const clon = JSON.parse(antes);
        // Sello de versión: permite al merge y al servidor distinguir la copia más reciente.
        clon.actualizadoEn = new Date().toISOString();
        const st = { fallos: 0 };
        const clienteId = item.clienteId || (entry.col === "clientes" ? item.id : "_sin_cliente");
        const limpio = await procesarArchivos(clon, clienteId, entry.carpeta, st);
        const r = await A.dataPut(entry.col, item.id, limpio);
        if (!r || !r.data) throw new Error("sin respuesta del servidor");
        // Lápida en el servidor: este registro fue eliminado — quitar la copia local
        // en vez de revivirlo (la eliminación de un usuario vale para todos).
        if (r.eliminado) {
          try {
            const fresco = JSON.parse(localStorage.getItem(entry.key) || "[]");
            localStorage.setItem(entry.key, JSON.stringify(fresco.filter((x) => !x || x.id !== item.id)));
          } catch (e) {}
          delete synced[item.id];
          banner("⚠ Un registro fue eliminado por otro usuario; ese cambio no se guardó y desaparecerá al recargar.", "warn");
          continue;
        }
        const guardado = r.data;
        if (st.fallos > 0) { errores += st.fallos; continue; } // sigue "sucio": reintentará subir los adjuntos
        // Folio autoritativo del servidor: reflejarlo en la copia local.
        if (guardado.folio && guardado.folio !== item.folio) {
          try {
            const fresco = JSON.parse(localStorage.getItem(entry.key) || "[]");
            const i = fresco.findIndex((x) => x && x.id === item.id);
            if (i >= 0) { fresco[i].folio = guardado.folio; localStorage.setItem(entry.key, JSON.stringify(fresco)); }
            item.folio = guardado.folio;
          } catch (e) {}
        }
        synced[item.id] = huella(JSON.stringify(item));
      } catch (e) {
        errores++;
        console.warn("[sync] " + entry.col + " id=" + item.id + ":", e.message);
      }
    }
    guardarSynced(entry.col, synced);
    return errores;
  }

  // Propaga al servidor las eliminaciones encoladas. Devuelve las que fallaron.
  async function procesarEliminaciones() {
    const q = leerColaDel();
    if (!q.length) return 0;
    const resto = [];
    for (const p of q) {
      try {
        const ok = await A.dataDelete(p.col, p.id);
        if (!ok) resto.push(p);
      } catch (e) { resto.push(p); }
    }
    guardarColaDel(resto);
    return resto.length;
  }

  // Empuja todo (cambios + eliminaciones) y refleja el resultado al usuario.
  let empujando = false;
  async function empujarTodo(mostrarOk) {
    if (empujando) return;
    empujando = true;
    try {
      let errores = await procesarEliminaciones();
      for (const entry of MAP) errores += (await upsert(entry).catch(() => 1)) || 0;
      if (errores > 0) {
        banner("⚠ " + errores + " cambio(s) aún no se guardan en el servidor. Reintentando automáticamente…", "err");
        programarReintento();
      } else if (mostrarOk || bannerTipo === "err") {
        banner("✓ Todo guardado en el servidor", "ok");
      }
      return errores;
    } finally {
      empujando = false;
    }
  }

  // Envuelve cada guardar*(): tras guardar localmente, empuja los cambios y
  // muestra al usuario si quedaron en el servidor (o si se reintentará).
  MAP.forEach((entry) => {
    const original = window[entry.fn];
    if (typeof original !== "function") return;
    window[entry.fn] = function () {
      const r = original.apply(this, arguments);
      banner("Guardando en el servidor…", "info");
      upsert(entry)
        .then((errores) => {
          if (errores > 0) {
            banner("⚠ No se pudo guardar en el servidor. Se reintentará automáticamente.", "err");
            programarReintento();
          } else {
            banner("✓ Guardado en el servidor", "ok");
          }
        })
        .catch((e) => {
          console.warn("[sync]", entry.col, e);
          banner("⚠ No se pudo guardar en el servidor. Se reintentará automáticamente.", "err");
          programarReintento();
        });
      return r;
    };
  });

  // Envuelve cada eliminar*(): si el registro efectivamente se quitó localmente
  // (no se canceló el confirm/motivo), propaga la eliminación al servidor.
  function existeLocal(key, id) {
    try { return (JSON.parse(localStorage.getItem(key) || "[]") || []).some((x) => x && x.id === id); }
    catch (e) { return false; }
  }
  DEL_MAP.forEach((d) => {
    const original = window[d.fn];
    if (typeof original !== "function") return;
    window[d.fn] = function (id) {
      const habia = existeLocal(d.key, id);
      const r = original.apply(this, arguments);
      if (habia && !existeLocal(d.key, id)) {
        const q = leerColaDel();
        q.push({ col: d.col, id: String(id) });
        guardarColaDel(q);
        const synced = leerSynced(d.col);
        delete synced[id];
        guardarSynced(d.col, synced);
        procesarEliminaciones().then((fallidas) => {
          if (fallidas > 0) { banner("⚠ La eliminación se aplicará en el servidor al reconectar.", "err"); programarReintento(); }
        });
      }
      return r;
    };
  });

  // Envuelve eliminarTodo() (zona de peligro): la limpieza masiva también se
  // propaga al servidor como lápidas — si no, el pull restauraría todo.
  (function () {
    const original = window.eliminarTodo;
    if (typeof original !== "function") return;
    window.eliminarTodo = function () {
      const antes = {};
      MAP.forEach((e) => {
        try { antes[e.col] = (JSON.parse(localStorage.getItem(e.key) || "[]") || []).map((x) => x && x.id).filter(Boolean); }
        catch (_) { antes[e.col] = []; }
      });
      const r = original.apply(this, arguments);
      const q = leerColaDel();
      let n = 0;
      MAP.forEach((e) => {
        let ahora;
        try { ahora = new Set((JSON.parse(localStorage.getItem(e.key) || "[]") || []).map((x) => x && x.id)); }
        catch (_) { ahora = new Set(); }
        const synced = leerSynced(e.col);
        (antes[e.col] || []).forEach((id) => {
          if (!ahora.has(id)) { q.push({ col: e.col, id: String(id), en: new Date().toISOString() }); delete synced[id]; n++; }
        });
        guardarSynced(e.col, synced);
      });
      if (n > 0) {
        guardarColaDel(q);
        banner("Eliminando " + n + " registro(s) también en el servidor…", "info");
        procesarEliminaciones().then((fallidas) => {
          if (fallidas > 0) { banner("⚠ Algunas eliminaciones se aplicarán al reconectar.", "err"); programarReintento(); }
          else banner("✓ Eliminado también en el servidor", "ok");
        });
      }
      return r;
    };
  })();

  // BAJADA (pull): trae del VPS lo creado desde cualquier equipo/usuario y lo
  // fusiona con lo local por id (gana la versión más reciente). No revive lo
  // que está pendiente de eliminar. Marca lo bajado como sincronizado.
  async function pull() {
    let huboCambios = false;
    const pendientesDel = leerColaDel();
    for (const entry of MAP) {
      try {
        const remotos = await A.dataList(entry.col);
        if (!remotos.length) continue;
        let local;
        try { local = JSON.parse(localStorage.getItem(entry.key) || "[]"); } catch (e) { local = []; }
        if (!Array.isArray(local)) local = [];
        const porId = {};
        local.forEach((x) => { if (x && x.id) porId[x.id] = x; });
        const synced = leerSynced(entry.col);
        remotos.forEach((remoto) => {
          const id = remoto.id;
          if (!id) return;
          if (pendientesDel.some((p) => p.col === entry.col && p.id === String(id))) return; // no revivir eliminados
          // Lápida: el registro fue eliminado por algún usuario — quitar la copia
          // local si existe y no volver a mostrarlo nunca.
          if (remoto.eliminado) {
            if (porId[id]) { delete porId[id]; huboCambios = true; }
            delete synced[id];
            return;
          }
          const loc = porId[id];
          const rMod = remoto.actualizadoEn || remoto.creadoEn || "";
          const lMod = loc ? (loc.actualizadoEn || loc.creadoEn || "") : null;
          if (!loc || (rMod && rMod > lMod)) {
            porId[id] = remoto;
            synced[id] = huella(JSON.stringify(remoto)); // ya está en el servidor: no re-subir
            huboCambios = true;
          }
        });
        const merged = Object.values(porId).sort((a, b) => String(b.creadoEn || "").localeCompare(String(a.creadoEn || "")));
        localStorage.setItem(entry.key, JSON.stringify(merged));
        guardarSynced(entry.col, synced);
      } catch (e) {
        console.warn("[sync] pull " + entry.col + ":", e.message);
      }
    }
    return huboCambios;
  }

  // Reintenta apenas vuelva la conexión a internet.
  window.addEventListener("online", () => empujarTodo(false));

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
    empujarTodo(false);
  });

  A.sync = { ahora: () => empujarTodo(true), pull };
  console.info("[sync] Sincronización bidireccional con el VPS activa (VPS manda).");
})();
