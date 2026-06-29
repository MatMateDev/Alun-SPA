/* ============================================================================
 *  MODEL · Compra / Operación — tabla public.compras
 *  Inversiones Alun SpA — Portal interno UAF
 * ----------------------------------------------------------------------------
 *  Folio CO-000001 generado por la BD. Requiere cliente_id (FK a clientes).
 *  Columnas: fecha, tipo_operacion(compra_div|venta_div|liq), moneda_compra,
 *    monto_compra, moneda_pago, tipo_cambio, tc_proveedor, contraparte,
 *    proveedor_id, comision, ganancia_clp, ...
 * ========================================================================== */
(function () {
  "use strict";
  const A = (window.Alun = window.Alun || {});
  const TABLE = "compras";

  const Compra = {
    async listar({ clienteId = null, limite = 200 } = {}) {
      let q = A.db
        .from(TABLE)
        .select("*, clientes(folio, razon_social)")
        .order("fecha", { ascending: false })
        .limit(limite);
      if (clienteId) q = q.eq("cliente_id", clienteId);
      const { data, error } = await q;
      return { data: data || [], error };
    },

    async obtener(id) {
      const { data, error } = await A.db.from(TABLE).select("*, clientes(folio, razon_social)").eq("id", id).single();
      return { data, error };
    },

    async crear(compra) {
      const payload = { ...compra };
      delete payload.id;
      delete payload.folio;
      const { data, error } = await A.db.from(TABLE).insert(payload).select().single();
      return { data, error };
    },

    async actualizar(id, cambios) {
      const payload = { ...cambios };
      delete payload.id;
      delete payload.folio;
      const { data, error } = await A.db.from(TABLE).update(payload).eq("id", id).select().single();
      return { data, error };
    },

    async eliminar(id) {
      const { error } = await A.db.from(TABLE).delete().eq("id", id);
      return { error };
    },
  };

  A.models.Compra = Compra;
})();
