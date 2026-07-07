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
    apiKey: "AIzaSyBQwVuTANgdUMZoZWDmM8cdYiLCmL-OtmA",
    authDomain: "inversiones-alun-spa-4c122.firebaseapp.com",
    databaseURL: "https://inversiones-alun-spa-4c122-default-rtdb.firebaseio.com",
    projectId: "inversiones-alun-spa-4c122",
    storageBucket: "inversiones-alun-spa-4c122.firebasestorage.app",
    messagingSenderId: "994437641963",
    appId: "1:994437641963:web:9c41e33cbb8082d3ae70ae",
    measurementId: "G-XLGXYYCSSV",
  };

  // Correos autorizados a ingresar al portal (defensa extra; además solo
  // existen como usuarios en Firebase Authentication los que tú crees).
  const ALLOWED_EMAILS = [
    "felgonzpu@gmail.com",
    "araosma@gmail.com"
  ];

  // Servicio propio en el VPS (BoxHosting) que guarda los documentos adjuntos.
  // Reemplaza a Cloud Storage (que exige plan de pago). Ver /vps-uploads.
  const UPLOADS_API_URL = "https://archivos.inversionesalun.cl";

  if (!window.firebase || typeof window.firebase.initializeApp !== "function") {
    console.error("[Alun] No se cargaron los SDK de Firebase (CDN).");
    return;
  }

  if (!window.firebase.apps.length) {
    window.firebase.initializeApp(firebaseConfig);
  }

  const A = (window.Alun = window.Alun || {});
  A.config = { projectId: firebaseConfig.projectId, ALLOWED_EMAILS, UPLOADS_API_URL };
  A.fb = window.firebase;
  A.authClient = window.firebase.auth();
  A.db = window.firebase.firestore();
  A.models = A.models || {};
  A.controllers = A.controllers || {};

  // Sube un archivo al servicio propio del VPS (carpeta clientes/{clienteId}/{subcarpeta}).
  // file puede ser un File/Blob, o un objeto { nombre, data } con data = dataURL base64.
  // Devuelve { storagePath, nombre, url:null } — no hay URL permanente: las descargas
  // se resuelven al vuelo con linkDescargaTemporal() (enlace firmado, expira en 5 min).
  A.subirDocumento = async function (clienteId, subcarpeta, file) {
    const user = A.authClient.currentUser;
    if (!user || !clienteId || !file) return null;
    const token = await user.getIdToken();
    const nombre = file.name || file.nombre || "archivo";
    let blob = file;
    if (file.data && typeof file.data === "string") {
      blob = await (await fetch(file.data)).blob(); // dataURL base64 -> Blob
    }
    const fd = new FormData();
    fd.append("file", blob, nombre);
    fd.append("clienteId", clienteId);
    fd.append("carpeta", subcarpeta);
    const resp = await fetch(UPLOADS_API_URL + "/api/upload", {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
      body: fd,
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || "No se pudo subir el archivo (" + resp.status + ").");
    }
    const data = await resp.json();
    return { storagePath: data.storagePath, nombre: data.nombre, url: null };
  };

  // Enlace de descarga temporal (válido 5 min) para un documento ya subido.
  A.linkDescargaTemporal = async function (storagePath) {
    const user = A.authClient.currentUser;
    if (!user || !storagePath) return null;
    const token = await user.getIdToken();
    const resp = await fetch(UPLOADS_API_URL + "/api/download-link?path=" + encodeURIComponent(storagePath), {
      headers: { Authorization: "Bearer " + token },
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return UPLOADS_API_URL + data.url;
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
