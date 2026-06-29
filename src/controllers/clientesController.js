/* ============================================================================
 *  CONTROLLER · Clientes — orquesta el modelo Cliente con la vista del portal.
 *  Inversiones Alun SpA — Portal interno UAF
 * ----------------------------------------------------------------------------
 *  Expone window.Alun.controllers.clientes con operaciones de alto nivel que
 *  la vista (app.html / legacy-app.js) puede invocar. Cada método devuelve
 *  { data, error } o { ok, error } para que la vista muestre el resultado.
 * ========================================================================== */
(function () {
  "use strict";
  const A = (window.Alun = window.Alun || {});
  const M = () => A.models.Cliente;

  const ctrl = {
    async cargar(filtro) {
      const { data, error } = await M().listar(filtro || {});
      if (error) console.error("[clientes] cargar:", error.message);
      return { data, error };
    },

    async guardar(cliente) {
      if (!cliente || !(cliente.razon_social || cliente.rl_nombre)) {
        return { error: { message: "Falta razón social o nombre del cliente." } };
      }
      return cliente.id ? M().actualizar(cliente.id, cliente) : M().crear(cliente);
    },

    async eliminar(id) {
      return M().eliminar(id);
    },

    async ver(id) {
      return M().obtener(id);
    },
  };

  A.controllers.clientes = ctrl;
})();
