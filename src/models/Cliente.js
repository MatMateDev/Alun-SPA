/* ============================================================================
 *  MODEL · Cliente (ficha KYB / KYC) — tabla public.clientes
 *  Inversiones Alun SpA — Portal interno UAF
 * ----------------------------------------------------------------------------
 *  Es la tabla más importante del sistema. El folio (CL-00001) lo genera la
 *  base de datos automáticamente; no lo envíes al crear.
 *  Columnas relevantes (ver db/schema_release1.sql):
 *    tipo_persona, razon_social, rut_comercial, giro, direccion, comuna, region,
 *    correo, telefono, rl_nombre, rl_rut, pep, ddc_nivel, ui_nivel_riesgo, ...
 * ========================================================================== */
(function () {
  "use strict";
  const A = (window.Alun = window.Alun || {});
  const TABLE = "clientes";

  const Cliente = {
    async listar({ buscar = "", limite = 200 } = {}) {
      let q = A.db.from(TABLE).select("*").order("created_at", { ascending: false }).limit(limite);
      if (buscar) {
        const term = `%${buscar}%`;
        q = q.or(`razon_social.ilike.${term},rut_comercial.ilike.${term},folio.ilike.${term}`);
      }
      const { data, error } = await q;
      return { data: data || [], error };
    },

    async obtener(id) {
      const { data, error } = await A.db.from(TABLE).select("*").eq("id", id).single();
      return { data, error };
    },

    async crear(cliente) {
      const payload = { ...cliente };
      delete payload.id;
      delete payload.folio; // lo genera la BD
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

  A.models.Cliente = Cliente;
})();
