/* ============================================================================
 *  MODEL · Cliente (ficha KYB / KYC) — colección "clientes" en el VPS
 *  Inversiones Alun SpA — Portal interno UAF
 * ----------------------------------------------------------------------------
 *  Es la entidad más importante. El folio (CL-00001) lo asigna el servidor.
 * ========================================================================== */
(function () {
  "use strict";
  const A = (window.Alun = window.Alun || {});
  const COL = "clientes";

  const Cliente = {
    async listar({ buscar = "", limite = 200 } = {}) {
      try {
        let data = (await A.dataList(COL)).slice(0, limite);
        if (buscar) {
          const t = buscar.trim().toLowerCase();
          data = data.filter((c) =>
            [c.razon_social, c.rut_comercial, c.folio].some((v) => (v || "").toLowerCase().includes(t))
          );
        }
        return { data, error: null };
      } catch (error) { return { data: [], error }; }
    },

    async obtener(id) {
      try {
        const d = (await A.dataList(COL)).find((c) => c.id === id);
        return { data: d || null, error: null };
      } catch (error) { return { data: null, error }; }
    },

    async crear(cliente) {
      try {
        const payload = { ...cliente, id: cliente.id || "c" + Date.now() };
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
        payload.actualizadoEn = new Date().toISOString();
        const guardado = await A.dataPut(COL, id, payload);
        return { data: guardado, error: null };
      } catch (error) { return { data: null, error }; }
    },

    async eliminar(id) {
      try { await A.dataDelete(COL, id); return { error: null }; }
      catch (error) { return { error }; }
    },
  };

  A.models.Cliente = Cliente;
})();
