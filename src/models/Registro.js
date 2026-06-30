/* ============================================================================
 *  MODEL · Registro de transferencia (Regla del Viaje) — colección "registros"
 *  Inversiones Alun SpA — Portal interno UAF
 * ----------------------------------------------------------------------------
 *  Folio OP-000001 automático. Requiere cliente_id.
 * ========================================================================== */
(function () {
  "use strict";
  const A = (window.Alun = window.Alun || {});
  const COL = "registros";

  const Registro = {
    async listar({ clienteId = null, limite = 300 } = {}) {
      try {
        let q = A.db.collection(COL).orderBy("created_at", "desc").limit(limite);
        if (clienteId) q = A.db.collection(COL).where("cliente_id", "==", clienteId).limit(limite);
        const snap = await q.get();
        return { data: snap.docs.map((d) => ({ id: d.id, ...d.data() })), error: null };
      } catch (error) { return { data: [], error }; }
    },

    async obtener(id) {
      try {
        const d = await A.db.collection(COL).doc(id).get();
        return { data: d.exists ? { id: d.id, ...d.data() } : null, error: null };
      } catch (error) { return { data: null, error }; }
    },

    async crear(registro) {
      try {
        const payload = { ...registro };
        delete payload.id;
        payload.folio = await A.nextFolio("registros", "OP-", 6);
        payload.created_at = A.serverTimestamp();
        const ref = await A.db.collection(COL).add(payload);
        return { data: { id: ref.id, ...payload }, error: null };
      } catch (error) { return { data: null, error }; }
    },

    async actualizar(id, cambios) {
      try {
        const payload = { ...cambios };
        delete payload.id; delete payload.folio; delete payload.created_at;
        await A.db.collection(COL).doc(id).update(payload);
        return { data: { id, ...payload }, error: null };
      } catch (error) { return { data: null, error }; }
    },

    async eliminar(id) {
      try { await A.db.collection(COL).doc(id).delete(); return { error: null }; }
      catch (error) { return { error }; }
    },
  };

  A.models.Registro = Registro;
})();
