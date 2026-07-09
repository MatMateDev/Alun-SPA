/* ============================================================================
 *  MODEL · Registro de transferencia (Regla del Viaje) — colección "registros"
 *  Inversiones Alun SpA — Portal interno UAF
 * ----------------------------------------------------------------------------
 *  Folio OP-000001 lo asigna el servidor. Requiere clienteId.
 * ========================================================================== */
(function () {
  "use strict";
  const A = (window.Alun = window.Alun || {});
  const COL = "registros";

  const Registro = {
    async listar({ clienteId = null, limite = 300 } = {}) {
      try {
        let data = await A.dataList(COL);
        if (clienteId) data = data.filter((r) => r.clienteId === clienteId);
        return { data: data.slice(0, limite), error: null };
      } catch (error) { return { data: [], error }; }
    },

    async obtener(id) {
      try {
        const d = (await A.dataList(COL)).find((r) => r.id === id);
        return { data: d || null, error: null };
      } catch (error) { return { data: null, error }; }
    },

    async crear(registro) {
      try {
        const payload = { ...registro, id: registro.id || Date.now().toString() };
        delete payload.folio;
        payload.creadoEn = new Date().toISOString();
        const guardado = await A.dataPut(COL, payload.id, payload);
        return { data: guardado, error: null };
      } catch (error) { return { data: null, error }; }
    },

    async actualizar(id, cambios) {
      try {
        const payload = { ...cambios, id };
        delete payload.folio;
        const guardado = await A.dataPut(COL, id, payload);
        return { data: guardado, error: null };
      } catch (error) { return { data: null, error }; }
    },

    async eliminar(id) {
      try { await A.dataDelete(COL, id); return { error: null }; }
      catch (error) { return { error }; }
    },
  };

  A.models.Registro = Registro;
})();
