/* ============================================================================
 *  MODEL · Compra / Operación — colección Firestore "compras"
 *  Inversiones Alun SpA — Portal interno UAF
 * ----------------------------------------------------------------------------
 *  Folio CO-000001 automático. Requiere cliente_id. Se denormaliza
 *  cliente_nombre/cliente_folio al crear para listar sin "joins".
 * ========================================================================== */
(function () {
  "use strict";
  const A = (window.Alun = window.Alun || {});
  const COL = "compras";

  const Compra = {
    async listar({ clienteId = null, limite = 200 } = {}) {
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

    async crear(compra) {
      try {
        const payload = { ...compra };
        delete payload.id;
        payload.folio = await A.nextFolio("compras", "CO-", 6);
        payload.created_at = A.serverTimestamp();
        payload.updated_at = A.serverTimestamp();
        const ref = await A.db.collection(COL).add(payload);
        return { data: { id: ref.id, ...payload }, error: null };
      } catch (error) { return { data: null, error }; }
    },

    async actualizar(id, cambios) {
      try {
        const payload = { ...cambios };
        delete payload.id; delete payload.folio; delete payload.created_at;
        payload.updated_at = A.serverTimestamp();
        await A.db.collection(COL).doc(id).update(payload);
        return { data: { id, ...payload }, error: null };
      } catch (error) { return { data: null, error }; }
    },

    async eliminar(id) {
      try { await A.db.collection(COL).doc(id).delete(); return { error: null }; }
      catch (error) { return { error }; }
    },
  };

  A.models.Compra = Compra;
})();
