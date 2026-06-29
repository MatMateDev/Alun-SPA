/* ============================================================================
 *  CONTROLLER · Compras / Operaciones — orquesta el modelo Compra.
 *  Inversiones Alun SpA — Portal interno UAF
 * ========================================================================== */
(function () {
  "use strict";
  const A = (window.Alun = window.Alun || {});
  const M = () => A.models.Compra;

  const ctrl = {
    async cargar(filtro) {
      const { data, error } = await M().listar(filtro || {});
      if (error) console.error("[compras] cargar:", error.message);
      return { data, error };
    },
    async guardar(compra) {
      if (!compra || !compra.cliente_id) {
        return { error: { message: "La operación requiere un cliente." } };
      }
      return compra.id ? M().actualizar(compra.id, compra) : M().crear(compra);
    },
    async eliminar(id) {
      return M().eliminar(id);
    },
    async ver(id) {
      return M().obtener(id);
    },
  };

  A.controllers.compras = ctrl;
})();
