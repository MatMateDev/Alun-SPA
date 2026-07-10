/* ============================================================================
 *  SERVICE · Almacén en el VPS — SIN almacenamiento local
 *  Inversiones Alun SpA — Portal interno UAF
 * ----------------------------------------------------------------------------
 *  Modelo: el VPS es el ÚNICO lugar donde viven los datos.
 *  - Al iniciar sesión se CARGA todo desde el servidor a memoria y se pinta.
 *  - Al presionar Guardar, se envía al servidor lo que cambió y la vista
 *    muestra la versión que el servidor confirmó (folio y adjuntos incluidos).
 *  - Nada persiste en el navegador: ni localStorage ni sessionStorage (se
 *    purgan restos de versiones anteriores). Al cerrar la pestaña, la única
 *    copia es la del VPS.
 *  - Eliminar marca lápida en el servidor (retención UAF; nadie la revive).
 *
 *  Debe cargarse DESPUÉS de legacy-app.js y de src/config/firebase.js.
 * ========================================================================== */
(function () {
  "use strict";
  const A = window.Alun;
  if (!A || !A.dataList) { console.error("[sync] API del VPS no inicializada"); return; }

  // Purga de restos locales de versiones anteriores (requisito: nada local).
  try {
    Object.keys(localStorage).filter((k) => k.indexOf("alun_") === 0).forEach((k) => localStorage.removeItem(k));
    sessionStorage.removeItem("alun_pull_ok");
  } catch (e) {}

  // Colección del VPS ↔ array global del portal (en memoria) ↔ guardar*() que la persiste.
  const MAP = [
    { col: "clientes",  carpeta: "ficha",          fn: "guardarClientes",  get: () => clientes,        set: (v) => { clientes = v; } },
    { col: "registros", carpeta: "transferencias", fn: "guardarDatos",     get: () => registros,       set: (v) => { registros = v; } },
    { col: "facturas",  carpeta: "facturas",       fn: "guardarFacturas",  get: () => facturas,        set: (v) => { facturas = v; } },
    { col: "compras",   carpeta: "compras",        fn: "guardarCompras",   get: () => compras,         set: (v) => { compras = v; } },
    { col: "cuenta",    carpeta: "cuenta",         fn: "guardarCuenta",    get: () => cuenta,          set: (v) => { cuenta = v; } },
    { col: "movimientos",        carpeta: "archivo", fn: "guardarMovimientos",      get: () => movimientos,     set: (v) => { movimientos = v; } },
    { col: "proveedores",        carpeta: "archivo", fn: "guardarProveedores",      get: () => proveedores,     set: (v) => { proveedores = v; } },
    { col: "cuentas_bancarias",  carpeta: "archivo", fn: "guardarCuentasBancarias", get: () => cuentasBancarias, set: (v) => { cuentasBancarias = v; } },
    { col: "cartola",            carpeta: "archivo", fn: "guardarCartola",          get: () => cartolaLineas,   set: (v) => { cartolaLineas = v; } },
    { col: "archivo",             carpeta: "archivo", fn: "guardarArchivo",             get: () => archivo,             set: (v) => { archivo = v; } },
    { col: "alertas_descartadas", carpeta: "alertas", fn: "guardarAlertasDescartadas",  get: () => alertasDescartadas,  set: (v) => { alertasDescartadas = v; } },
    // Configuración (umbrales, folios, logo): un solo documento; sin subir su logo como adjunto.
    { col: "configuracion", carpeta: "archivo", fn: "guardarConfigData", especial: "config",
      get: () => [Object.assign({ id: "config" }, config)],
      set: (v) => { const d = (v || [])[0]; if (d) { config = Object.assign(config, d); if (!config.logo) config.logo = (typeof LOGO_ALUN !== "undefined" ? LOGO_ALUN : ""); } } },
  ];

  // Funciones eliminar*() del legacy cuya eliminación se propaga como lápida.
  const DEL_MAP = [
    { fn: "eliminarCliente",        col: "clientes",          get: () => clientes },
    { fn: "eliminarRegistro",       col: "registros",         get: () => registros },
    { fn: "eliminarFactura",        col: "facturas",          get: () => facturas },
    { fn: "eliminarCompra",         col: "compras",           get: () => compras },
    { fn: "eliminarMovCuenta",      col: "cuenta",            get: () => cuenta },
    { fn: "eliminarMovimiento",     col: "movimientos",       get: () => movimientos },
    { fn: "eliminarProveedor",      col: "proveedores",       get: () => proveedores },
    { fn: "eliminarCuentaBancaria", col: "cuentas_bancarias", get: () => cuentasBancarias },
  ];

  const esArchivo = (o) => o && typeof o === "object" && typeof o.data === "string" && o.data.indexOf("data:") === 0;

  // Estado en memoria (nada se escribe en el navegador).
  const sincronizado = {}; // col -> { id: huella del último estado confirmado por el servidor }
  MAP.forEach((e) => { sincronizado[e.col] = {}; });
  const sellos = {};       // col -> { id: {base, sello} } — actualizadoEn estable por contenido (LWW justo)
  MAP.forEach((e) => { sellos[e.col] = {}; });
  let colaDel = [];        // eliminaciones pendientes de confirmar en el servidor
  let cargado = false;     // true cuando la carga inicial desde el VPS terminó

  // Overlay que bloquea la interacción hasta que los datos del VPS estén cargados
  // (evita crear/editar sobre datos incompletos y perderlos al llegar el servidor).
  let overlayEl = null;
  function overlayCarga(mostrar, texto) {
    if (!overlayEl) {
      overlayEl = document.createElement("div");
      overlayEl.id = "sync-overlay";
      overlayEl.style.cssText = "position:fixed;inset:0;z-index:9998;background:rgba(244,245,241,.86);" +
        "display:flex;align-items:center;justify-content:center;font:600 15px 'Hanken Grotesk',system-ui,sans-serif;color:#3E4D5C;";
      document.body.appendChild(overlayEl);
    }
    overlayEl.textContent = texto || "Cargando datos del servidor…";
    overlayEl.style.display = mostrar ? "flex" : "none";
  }

  function huella(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return String(h);
  }

  // ── Banner de estado (única señal visual; no persiste nada) ────────────────
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

  let retryTimer = null;
  function programarReintento() {
    if (retryTimer) return;
    retryTimer = setTimeout(() => { retryTimer = null; empujarTodo(false); }, 30000);
  }

  // Repinta el portal con lo que hay en memoria (que es lo confirmado por el VPS).
  function repintar() {
    ["aplicarLogo", "cargarConfigForm", "renderClientes", "filtrar", "renderFacturas", "poblarSelectFacturas",
     "poblarFacCliente", "poblarSelectsCompra", "renderCompras", "renderSaldos", "renderCuenta", "renderMovimientos",
     "poblarMovCliente", "renderProveedores", "renderCuentasBancarias", "renderCartola", "renderResultados",
     "poblarProveedoresSelects", "poblarCuentasBancariasSelects", "poblarConcCuenta",
     "actualizarDashboard", "verificarAlertas", "verificarPendientes"]
      .forEach((n) => { try { if (typeof window[n] === "function") window[n](); } catch (e) {} });
  }

  // Sube adjuntos base64 al VPS y los reemplaza por { nombre, storagePath }.
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

  // Envía al servidor los registros que cambiaron; la memoria queda con la
  // versión CONFIRMADA por el servidor (folio y rutas de adjuntos incluidos).
  // Devuelve la cantidad de registros que no lograron guardarse.
  async function upsert(entry) {
    const arr = entry.get();
    if (!Array.isArray(arr) || !arr.length) return 0;
    const synced = sincronizado[entry.col];
    let errores = 0, huboWriteBack = false;
    for (const item of arr.slice()) {
      if (!item || !item.id) continue;
      const antes = JSON.stringify(item);
      const hBase = huella(antes);
      if (synced[item.id] === hBase) continue; // sin cambios desde la última confirmación
      try {
        const clon = JSON.parse(antes);
        // Sello LWW ESTABLE: se fija cuando cambia el contenido y se reutiliza en
        // los reintentos — así una copia vieja reenviada tarde no gana por reloj.
        const s = sellos[entry.col][item.id];
        if (!s || s.base !== hBase) sellos[entry.col][item.id] = { base: hBase, sello: new Date().toISOString() };
        clon.actualizadoEn = sellos[entry.col][item.id].sello;
        const st = { fallos: 0 };
        let limpio = clon;
        if (!entry.especial) {
          const clienteId = item.clienteId || (entry.col === "clientes" ? item.id : "_sin_cliente");
          limpio = await procesarArchivos(clon, clienteId, entry.carpeta, st);
        }
        // Si algún adjunto no se pudo subir, NO se persiste la ficha con el stub:
        // queda sucia completa (base64 en memoria) y se reintenta todo junto.
        if (st.fallos > 0) { errores += st.fallos; continue; }
        const r = await A.dataPut(entry.col, item.id, limpio);
        if (!r || !r.data) throw new Error("sin respuesta del servidor");
        if (r.eliminado) {
          // Lápida: fue eliminado por otro usuario — quitarlo de la vista, no revivirlo.
          entry.set(entry.get().filter((x) => !x || x.id !== item.id));
          delete synced[item.id]; delete sellos[entry.col][item.id];
          huboWriteBack = true;
          banner("⚠ Un registro fue eliminado por otro usuario; ese cambio no se guardó.", "warn");
          continue;
        }
        if (r.ignorado) {
          // El servidor conserva una versión MÁS RECIENTE (de otro usuario): se
          // muestra esa versión y se descarta la copia local antigua, avisando.
          if (!entry.especial) {
            const vivo = entry.get();
            const i = vivo.findIndex((x) => x && x.id === item.id);
            if (i >= 0) { vivo[i] = r.data; huboWriteBack = true; }
          }
          synced[item.id] = huella(JSON.stringify(entry.especial ? entry.get()[0] : r.data));
          delete sellos[entry.col][item.id];
          banner("⚠ Otro usuario guardó una versión más reciente de un registro; se muestra la versión del servidor.", "warn");
          continue;
        }
        // La vista muestra EXACTAMENTE lo confirmado por el servidor.
        if (!entry.especial) {
          const vivo = entry.get();
          const i = vivo.findIndex((x) => x && x.id === item.id);
          if (i >= 0 && JSON.stringify(vivo[i]) === antes) { vivo[i] = r.data; huboWriteBack = true; }
          synced[item.id] = huella(JSON.stringify(r.data));
        } else {
          // Config: la huella se calcula sobre la forma local (orden de claves estable).
          synced[item.id] = huella(JSON.stringify(entry.get()[0]));
        }
        delete sellos[entry.col][item.id];
      } catch (e) {
        errores++;
        console.warn("[sync] " + entry.col + " id=" + item.id + ":", e.message);
      }
    }
    if (huboWriteBack) repintar();
    return errores;
  }

  async function procesarEliminaciones() {
    if (!colaDel.length) return 0;
    const resto = [];
    for (const p of colaDel) {
      try { if (!(await A.dataDelete(p.col, p.id))) resto.push(p); }
      catch (e) { resto.push(p); }
    }
    colaDel = resto;
    return resto.length;
  }

  let empujando = false;
  async function empujarTodo(mostrarOk) {
    if (empujando || !cargado) return;
    empujando = true;
    try {
      let errores = await procesarEliminaciones();
      for (const entry of MAP) errores += (await upsert(entry).catch(() => 1)) || 0;
      if (errores > 0) {
        banner("⚠ " + errores + " cambio(s) aún no se guardan en el servidor. NO cierre la página; se reintenta automáticamente…", "err");
        programarReintento();
      } else if (mostrarOk || bannerTipo === "err") {
        banner("✓ Todo guardado en el servidor", "ok");
      }
      return errores;
    } finally {
      empujando = false;
    }
  }

  // Envuelve cada guardar*(): al Guardar se envía al VPS y se informa el resultado.
  MAP.forEach((entry) => {
    const original = window[entry.fn];
    if (typeof original !== "function") return;
    window[entry.fn] = function () {
      const r = original.apply(this, arguments);
      if (!cargado) {
        // La carga inicial aún no termina (el overlay debería impedir llegar aquí):
        // avisar en vez de fallar en silencio; lo escrito se empuja al terminar la carga.
        banner("⚠ Aún se cargan los datos del servidor; el cambio se enviará al terminar.", "warn");
        return r;
      }
      banner("Guardando en el servidor…", "info");
      upsert(entry)
        .then((errores) => {
          if (errores > 0) {
            banner("⚠ No se pudo guardar en el servidor. NO cierre la página; se reintentará automáticamente.", "err");
            programarReintento();
          } else if (bannerTipo !== "warn") { // no tapar avisos (p.ej. "eliminado por otro usuario")
            banner("✓ Guardado en el servidor", "ok");
          }
        })
        .catch((e) => {
          console.warn("[sync]", entry.col, e);
          banner("⚠ No se pudo guardar en el servidor. NO cierre la página; se reintentará automáticamente.", "err");
          programarReintento();
        });
      return r;
    };
  });

  // Envuelve cada eliminar*(): si el registro se quitó de memoria (no se canceló
  // el confirm/motivo), se lapida en el servidor.
  DEL_MAP.forEach((d) => {
    const original = window[d.fn];
    if (typeof original !== "function") return;
    window[d.fn] = function (id) {
      const habia = (d.get() || []).some((x) => x && x.id === id);
      const r = original.apply(this, arguments);
      const sigue = (d.get() || []).some((x) => x && x.id === id);
      if (habia && !sigue) {
        colaDel.push({ col: d.col, id: String(id), en: new Date().toISOString() });
        delete sincronizado[d.col][id];
        procesarEliminaciones().then((fallidas) => {
          if (fallidas > 0) { banner("⚠ La eliminación se aplicará en el servidor al reconectar. NO cierre la página.", "err"); programarReintento(); }
          else banner("✓ Eliminado en el servidor", "ok");
        });
      }
      return r;
    };
  });

  // Cartola: sus líneas se quitan con funciones propias (no eliminar*) — también se lapidan.
  ["quitarLineaCartola", "limpiarCartola"].forEach((fn) => {
    const original = window[fn];
    if (typeof original !== "function") return;
    window[fn] = function () {
      const antes = (cartolaLineas || []).map((x) => x && x.id).filter(Boolean);
      const r = original.apply(this, arguments);
      const ahora = new Set((cartolaLineas || []).map((x) => x && x.id));
      let n = 0;
      antes.forEach((id) => {
        if (!ahora.has(id)) { colaDel.push({ col: "cartola", id: String(id), en: new Date().toISOString() }); delete sincronizado["cartola"][id]; delete sellos["cartola"][id]; n++; }
      });
      if (n > 0) {
        procesarEliminaciones().then((fallidas) => {
          if (fallidas > 0) { banner("⚠ Eliminaciones de cartola pendientes; se aplicarán al reconectar.", "err"); programarReintento(); }
        });
      }
      return r;
    };
  });

  // ¿Quedan cambios locales sin confirmar por el servidor?
  function hayPendientes() {
    if (colaDel.length > 0 || empujando) return true;
    for (const entry of MAP) {
      const synced = sincronizado[entry.col];
      for (const item of entry.get() || []) {
        if (item && item.id && synced[item.id] !== huella(JSON.stringify(item))) return true;
      }
    }
    return false;
  }

  // Envuelve eliminarTodo() (zona de peligro): también lapida todo en el servidor.
  (function () {
    const original = window.eliminarTodo;
    if (typeof original !== "function") return;
    window.eliminarTodo = function () {
      const antes = {};
      MAP.forEach((e) => { if (!e.especial) antes[e.col] = (e.get() || []).map((x) => x && x.id).filter(Boolean); });
      const r = original.apply(this, arguments);
      let n = 0;
      MAP.forEach((e) => {
        if (e.especial) return;
        const ahora = new Set((e.get() || []).map((x) => x && x.id));
        (antes[e.col] || []).forEach((id) => {
          if (!ahora.has(id)) { colaDel.push({ col: e.col, id: String(id), en: new Date().toISOString() }); delete sincronizado[e.col][id]; n++; }
        });
      });
      if (n > 0) {
        banner("Eliminando " + n + " registro(s) en el servidor…", "info");
        procesarEliminaciones().then((fallidas) => {
          if (fallidas > 0) { banner("⚠ Algunas eliminaciones se aplicarán al reconectar. NO cierre la página.", "err"); programarReintento(); }
          else banner("✓ Eliminado también en el servidor", "ok");
        });
      }
      return r;
    };
  })();

  // CARGA INICIAL: todo desde el VPS a memoria; las lápidas no se muestran.
  // Lo creado localmente mientras cargaba (id que el servidor no conoce) se
  // CONSERVA y se empuja después — nunca se descarta trabajo del usuario.
  async function cargarDesdeServidor() {
    for (const entry of MAP) {
      const items = await A.dataList(entry.col); // si falla, lanza y se reintenta completo
      const vivos = items.filter((x) => x && x.id && !x.eliminado);
      const lapidas = new Set(items.filter((x) => x && x.eliminado).map((x) => x.id));
      const idsServidor = new Set(vivos.map((x) => x.id));
      const localesNuevos = entry.especial ? [] :
        (entry.get() || []).filter((x) => x && x.id && !idsServidor.has(x.id) && !lapidas.has(x.id));
      const todos = localesNuevos.concat(vivos);
      todos.sort((a, b) => String(b.creadoEn || "").localeCompare(String(a.creadoEn || "")));
      entry.set(todos);
      const synced = sincronizado[entry.col];
      if (entry.especial) {
        synced["config"] = huella(JSON.stringify(entry.get()[0])); // huella sobre la forma local
      } else {
        vivos.forEach((x) => { synced[x.id] = huella(JSON.stringify(x)); }); // localesNuevos quedan sucios → se empujan
      }
    }
    cargado = true;
  }

  async function iniciar() {
    overlayCarga(true);
    try {
      await cargarDesdeServidor();
      repintar();
      overlayCarga(false);
      banner("✓ Datos cargados del servidor", "ok");
      empujarTodo(false); // empuja lo creado durante la carga (si hubo)
    } catch (e) {
      console.warn("[sync] carga inicial:", e.message);
      overlayCarga(true, "⚠ No se pudo conectar con el servidor. Reintentando…");
      setTimeout(iniciar, 8000);
    }
  }

  // Aviso al salir si quedan cambios sin confirmar por el servidor.
  window.addEventListener("beforeunload", (ev) => {
    if (hayPendientes()) { ev.preventDefault(); ev.returnValue = "Hay cambios sin guardar en el servidor."; }
  });

  window.addEventListener("online", () => empujarTodo(false));

  A.auth.sesion().then((u) => { if (u) iniciar(); });

  A.sync = { ahora: () => empujarTodo(true), recargar: iniciar, hayPendientes };
  console.info("[sync] Almacén en el VPS activo — sin almacenamiento local.");
})();
