/* ============================================================================
 *  MODEL · Compra / Operación — colección "compras" en el VPS
 *  Inversiones Alun SpA — Portal interno UAF
 * ----------------------------------------------------------------------------
 *  Folio CO-000001 lo asigna el servidor. Requiere clienteId.
 * ========================================================================== */
(function () {
  "use strict";
  const A = (window.Alun = window.Alun || {});
  const COL = "compras";

  const Compra = {
    async listar({ clienteId = null, limite = 200 } = {}) {
      try {
        let data = await A.dataList(COL);
        if (clienteId) data = data.filter((c) => c.clienteId === clienteId);
        return { data: data.slice(0, limite), error: null };
      } catch (error) { return { data: [], error }; }
    },

    async obtener(id) {
      try {
        const d = (await A.dataList(COL)).find((c) => c.id === id);
        return { data: d || null, error: null };
      } catch (error) { return { data: null, error }; }
    },

    async crear(compra) {
      try {
        const payload = { ...compra, id: compra.id || "co" + Date.now() };
        delete payload.folio;
        payload.creadoEn = new Date().toISOString();
        const r = await A.dataPut(COL, payload.id, payload); const guardado = r && r.data;
        return { data: guardado, error: null };
      } catch (error) { return { data: null, error }; }
    },

    async actualizar(id, cambios) {
      try {
        const payload = { ...cambios, id };
        delete payload.folio;
        const r = await A.dataPut(COL, id, payload); const guardado = r && r.data;
        return { data: guardado, error: null };
      } catch (error) { return { data: null, error }; }
    },

    async eliminar(id) {
      try { await A.dataDelete(COL, id); return { error: null }; }
      catch (error) { return { error }; }
    },
  };

  A.models.Compra = Compra;
})();
