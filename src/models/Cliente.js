/* ============================================================================
 *  MODEL · Cliente (ficha KYB / KYC) — colección Firestore "clientes"
 *  Inversiones Alun SpA — Portal interno UAF
 * ----------------------------------------------------------------------------
 *  Es la entidad más importante. El folio (CL-00001) se genera automáticamente.
 * ========================================================================== */
(function () {
  "use strict";
  const A = (window.Alun = window.Alun || {});
  const COL = "clientes";

  const Cliente = {
    async listar({ buscar = "", limite = 200 } = {}) {
      try {
        const snap = await A.db.collection(COL).orderBy("created_at", "desc").limit(limite).get();
        let data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
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
        const d = await A.db.collection(COL).doc(id).get();
        return { data: d.exists ? { id: d.id, ...d.data() } : null, error: null };
      } catch (error) { return { data: null, error }; }
    },

    async crear(cliente) {
      try {
        const payload = { ...cliente };
        delete payload.id;
        payload.folio = await A.nextFolio("clientes", "CL-", 5);
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

  A.models.Cliente = Cliente;
})();
