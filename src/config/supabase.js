/* ============================================================================
 *  CONFIG · Cliente Supabase (capa de infraestructura del MVC)
 *  Inversiones Alun SpA — Portal interno UAF  (build: r1.2)
 * ----------------------------------------------------------------------------
 *  Requiere que el script UMD de @supabase/supabase-js se cargue ANTES
 *  (se incluye por CDN en index.html y app.html). Expone window.supabase.
 *  Todo el código de la app accede a la base de datos a través de
 *  window.Alun.db y a la sesión a través de window.Alun.auth.
 * ========================================================================== */
(function () {
  "use strict";

  // --- Credenciales del proyecto (clave PUBLICABLE, segura para el navegador) ---
  const SUPABASE_URL = "https://qywhxkjherhwbgcaddna.supabase.co";
  const SUPABASE_KEY = "sb_publishable_TR-DIN3AGLZ0_HrRK6e1Gw_2iloaioe";

  // --- Whitelist de correos autorizados a entrar al portal ---
  // El acceso es por código de verificación (OTP) que llega al correo.
  // Solo estos correos pueden solicitar y validar el código.
  const ALLOWED_EMAILS = [
    "felgonzpu@gmail.com",
    "araosma@gmail.com",
    "felipe@inversionesalun.cl",
  ];

  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    console.error("[Alun] No se cargó la librería de Supabase (CDN).");
    return;
  }

  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

  // Namespace global de la aplicación (estilo MVC sin bundler)
  window.Alun = window.Alun || {};
  window.Alun.config = { SUPABASE_URL, ALLOWED_EMAILS };
  window.Alun.client = client;        // cliente Supabase crudo
  window.Alun.db = client;            // alias semántico para los modelos
  window.Alun.models = window.Alun.models || {};
  window.Alun.controllers = window.Alun.controllers || {};

  // Helper: ¿el correo está autorizado?
  window.Alun.isAllowed = function (email) {
    if (!email) return false;
    return ALLOWED_EMAILS.map((e) => e.toLowerCase()).includes(email.trim().toLowerCase());
  };
})();
