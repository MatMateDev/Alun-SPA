/* ============================================================================
 *  CONTROLLER · Registros de transferencia (Regla del Viaje).
 *  Inversiones Alun SpA — Portal interno UAF
 * ========================================================================== */
(function () {
  "use strict";
  const A = (window.Alun = window.Alun || {});
  const M = () => A.models.Registro;

  const ctrl = {
    async cargar(filtro) {
      const { data, error } = await M().listar(filtro || {});
      if (error) console.error("[registros] cargar:", error.message);
      return { data, error };
    },
    async guardar(registro) {
      if (!registro || !registro.cliente_id) {
        return { error: { message: "El registro requiere un cliente." } };
      }
      return registro.id ? M().actualizar(registro.id, registro) : M().crear(registro);
    },
    async eliminar(id) {
      return M().eliminar(id);
    },
    async ver(id) {
      return M().obtener(id);
    },
  };

  A.controllers.registros = ctrl;
})();
