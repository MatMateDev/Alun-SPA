/* ============================================================================
 *  MODEL · Registro de transferencia (Regla del Viaje) — tabla public.registros
 *  Inversiones Alun SpA — Portal interno UAF
 * ----------------------------------------------------------------------------
 *  Folio OP-000001 generado por la BD. Requiere cliente_id (FK a clientes).
 *  Puede enlazar compra_id y factura_id (opcionales).
 *  Columnas: beneficiario_nombre, beneficiario_banco, beneficiario_cuenta,
 *    beneficiario_pais, moneda, monto, fecha, comprobante_hash,
 *    estado_documental(rojo|amarillo|verde).
 * ========================================================================== */
(function () {
  "use strict";
  const A = (window.Alun = window.Alun || {});
  const TABLE = "registros";

  const Registro = {
    async listar({ clienteId = null, limite = 300 } = {}) {
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

    async crear(registro) {
      const payload = { ...registro };
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

  A.models.Registro = Registro;
})();
