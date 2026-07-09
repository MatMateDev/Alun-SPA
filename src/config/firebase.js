/* ============================================================================
 *  CONFIG · Firebase Auth (login) + API propia del VPS (datos y archivos)
 *  Inversiones Alun SpA — Portal interno UAF
 * ----------------------------------------------------------------------------
 *  El login (correo + contraseña) usa Firebase Authentication.
 *  TODOS los registros (clientes, transferencias, facturas, compras, cuenta,
 *  archivo, alertas) y los documentos adjuntos viven en el VPS propio
 *  (BoxHosting): ver /vps-uploads. El VPS solo verifica la sesión de Firebase
 *  en cada operación (verifyIdToken) — no hay Firestore ni Cloud Storage.
 *  Requiere los SDK "compat" cargados ANTES (por CDN):
 *    firebase-app-compat.js · firebase-auth-compat.js
 *  Expone el namespace global window.Alun (estilo MVC sin bundler).
 * ========================================================================== */
(function () {
  "use strict";

  const firebaseConfig = {
    apiKey: "AIzaSyBQwVuTANgdUMZoZWDmM8cdYiLCmL-OtmA",
    authDomain: "inversiones-alun-spa-4c122.firebaseapp.com",
    projectId: "inversiones-alun-spa-4c122",
    appId: "1:994437641963:web:9c41e33cbb8082d3ae70ae",
  };

  // Correos autorizados a ingresar al portal (defensa extra; además solo
  // existen como usuarios en Firebase Authentication los que tú crees).
  const ALLOWED_EMAILS = [
    "felgonzpu@gmail.com",
    "araosma@gmail.com"
  ];

  // Servicio propio en el VPS (BoxHosting): datos (Postgres) + documentos.
  const API_URL = "https://archivos.sistema.inversionesalun.cl";

  if (!window.firebase || typeof window.firebase.initializeApp !== "function") {
    console.error("[Alun] No se cargaron los SDK de Firebase (CDN).");
    return;
  }

  if (!window.firebase.apps.length) {
    window.firebase.initializeApp(firebaseConfig);
  }

  const A = (window.Alun = window.Alun || {});
  A.config = { projectId: firebaseConfig.projectId, ALLOWED_EMAILS, API_URL };
  A.fb = window.firebase;
  A.authClient = window.firebase.auth();
  A.models = A.models || {};
  A.controllers = A.controllers || {};

  // Cabecera con el token de sesión actual (o null si no hay usuario).
  async function authHeader() {
    const user = A.authClient.currentUser;
    if (!user) return null;
    return { Authorization: "Bearer " + (await user.getIdToken()) };
  }

  // --- Documentos adjuntos ---------------------------------------------------
  // Sube un archivo al VPS (carpeta clientes/{clienteId}/{subcarpeta}).
  // file puede ser un File/Blob, o un objeto { nombre, data } con data = dataURL base64.
  // Devuelve { storagePath, nombre, url:null } — no hay URL permanente: las descargas
  // se resuelven al vuelo con linkDescargaTemporal() (enlace firmado, expira en 5 min).
  A.subirDocumento = async function (clienteId, subcarpeta, file) {
    const headers = await authHeader();
    if (!headers || !clienteId || !file) return null;
    const nombre = file.name || file.nombre || "archivo";
    let blob = file;
    if (file.data && typeof file.data === "string") {
      blob = await (await fetch(file.data)).blob(); // dataURL base64 -> Blob
    }
    const fd = new FormData();
    fd.append("file", blob, nombre);
    fd.append("clienteId", clienteId);
    fd.append("carpeta", subcarpeta);
    const resp = await fetch(API_URL + "/api/upload", { method: "POST", headers, body: fd });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || "No se pudo subir el archivo (" + resp.status + ").");
    }
    const data = await resp.json();
    return { storagePath: data.storagePath, nombre: data.nombre, url: null };
  };

  // Enlace de descarga temporal (válido 5 min) para un documento ya subido.
  A.linkDescargaTemporal = async function (storagePath) {
    const headers = await authHeader();
    if (!headers || !storagePath) return null;
    const resp = await fetch(API_URL + "/api/download-link?path=" + encodeURIComponent(storagePath), { headers });
    if (!resp.ok) return null;
    const data = await resp.json();
    return API_URL + data.url;
  };

  // --- Datos (registro compartido en Postgres, en el VPS) --------------------
  // Lista todos los documentos de una colección (clientes, registros, ...).
  A.dataList = async function (col) {
    const headers = await authHeader();
    if (!headers) return [];
    const resp = await fetch(API_URL + "/api/data/" + col, { headers });
    if (!resp.ok) return [];
    const data = await resp.json();
    return data.items || [];
  };

  // Crea o actualiza un documento. El servidor asigna el folio si es nuevo.
  A.dataPut = async function (col, id, obj) {
    const headers = await authHeader();
    if (!headers) return null;
    const resp = await fetch(API_URL + "/api/data/" + col + "/" + encodeURIComponent(id), {
      method: "PUT",
      headers: Object.assign({ "Content-Type": "application/json" }, headers),
      body: JSON.stringify(obj),
    });
    if (!resp.ok) throw new Error("No se pudo guardar en el servidor (" + resp.status + ").");
    return (await resp.json()).data;
  };

  A.dataDelete = async function (col, id) {
    const headers = await authHeader();
    if (!headers) return false;
    const resp = await fetch(API_URL + "/api/data/" + col + "/" + encodeURIComponent(id), { method: "DELETE", headers });
    return resp.ok;
  };

  A.isAllowed = function (email) {
    if (!email) return false;
    return ALLOWED_EMAILS.map((e) => e.toLowerCase()).includes(email.trim().toLowerCase());
  };
})();
