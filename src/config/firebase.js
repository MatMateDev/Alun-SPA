/* ============================================================================
 *  CONFIG · Firebase (Google Cloud) — infraestructura del MVC
 *  Inversiones Alun SpA — Portal interno UAF
 * ----------------------------------------------------------------------------
 *  Requiere los SDK "compat" de Firebase cargados ANTES (por CDN):
 *    firebase-app-compat.js · firebase-auth-compat.js · firebase-firestore-compat.js
 *  Expone el namespace global window.Alun (estilo MVC sin bundler).
 * ========================================================================== */
(function () {
  "use strict";

  const firebaseConfig = {
    apiKey: "AIzaSyBWqYXQrTlYfn_ihuBS_AgzP4H7t0_DU68",
    authDomain: "inversiones-alun-spa.firebaseapp.com",
    projectId: "inversiones-alun-spa",
    storageBucket: "inversiones-alun-spa.firebasestorage.app",
    messagingSenderId: "181011612076",
    appId: "1:181011612076:web:50d7b424ddf0a99120ba09",
    measurementId: "G-WQ422XW2W5",
  };

  // Correos autorizados a ingresar al portal (defensa extra; además solo
  // existen como usuarios en Firebase Authentication los que tú crees).
  const ALLOWED_EMAILS = [
    "felipe@inversionesalun.cl",
  ];

  if (!window.firebase || typeof window.firebase.initializeApp !== "function") {
    console.error("[Alun] No se cargaron los SDK de Firebase (CDN).");
    return;
  }

  if (!window.firebase.apps.length) {
    window.firebase.initializeApp(firebaseConfig);
  }

  const A = (window.Alun = window.Alun || {});
  A.config = { projectId: firebaseConfig.projectId, ALLOWED_EMAILS };
  A.fb = window.firebase;
  A.authClient = window.firebase.auth();
  A.db = window.firebase.firestore();
  A.storage = typeof window.firebase.storage === "function" ? window.firebase.storage() : null;
  A.models = A.models || {};
  A.controllers = A.controllers || {};

  // Sube un archivo a la carpeta del cliente y devuelve { storagePath, url, nombre }.
  // file puede ser un File/Blob, o un objeto { nombre, data } con data = dataURL base64.
  A.subirDocumento = async function (clienteId, subcarpeta, file) {
    if (!A.storage || !clienteId || !file) return null;
    const nombre = file.name || file.nombre || "archivo";
    const path = "clientes/" + clienteId + "/" + subcarpeta + "/" + Date.now() + "_" + nombre;
    const ref = A.storage.ref().child(path);
    if (file.data && typeof file.data === "string") {
      await ref.putString(file.data, "data_url"); // base64 dataURL
    } else {
      await ref.put(file); // File/Blob
    }
    const url = await ref.getDownloadURL();
    return { storagePath: path, url, nombre };
  };

  A.isAllowed = function (email) {
    if (!email) return false;
    return ALLOWED_EMAILS.map((e) => e.toLowerCase()).includes(email.trim().toLowerCase());
  };

  // Genera folios correlativos (CL-00001, CO-000001, ...) con una transacción.
  A.nextFolio = async function (entity, prefix, pad) {
    const ref = A.db.collection("counters").doc(entity);
    const n = await A.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const cur = snap.exists ? snap.data().n || 0 : 0;
      const next = cur + 1;
      tx.set(ref, { n: next }, { merge: true });
      return next;
    });
    return prefix + String(n).padStart(pad, "0");
  };

  A.serverTimestamp = function () {
    return window.firebase.firestore.FieldValue.serverTimestamp();
  };
})();
