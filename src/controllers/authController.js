/* ============================================================================
 *  CONTROLLER · Autenticación por código de verificación (Email OTP)
 *  Inversiones Alun SpA — Portal interno UAF
 * ----------------------------------------------------------------------------
 *  Flujo:
 *    1. enviarCodigo(email): valida whitelist y pide a Supabase el OTP por correo.
 *    2. verificarCodigo(email, token): valida el código de 6 dígitos.
 *    3. guard(): protege app.html; redirige a index.html si no hay sesión válida.
 *    4. cerrarSesion(): signOut y vuelta al login.
 * ========================================================================== */
(function () {
  "use strict";
  const A = (window.Alun = window.Alun || {});
  const auth = (A.auth = {});

  // Solicita el envío del código de verificación al correo indicado.
  auth.enviarCodigo = async function (email) {
    if (!A.isAllowed(email)) {
      return { ok: false, error: "Este correo no está autorizado para ingresar." };
    }
    const { error } = await A.client.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  };

  // Verifica el código de 6 dígitos recibido por correo.
  auth.verificarCodigo = async function (email, token) {
    if (!A.isAllowed(email)) {
      return { ok: false, error: "Este correo no está autorizado para ingresar." };
    }
    const { data, error } = await A.client.auth.verifyOtp({
      email: email.trim(),
      token: token.trim(),
      type: "email",
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, session: data.session };
  };

  // Devuelve la sesión actual (o null).
  auth.sesion = async function () {
    const { data } = await A.client.auth.getSession();
    return data ? data.session : null;
  };

  // Protege una página: si no hay sesión válida y autorizada, redirige al login.
  auth.guard = async function (loginUrl) {
    loginUrl = loginUrl || "index.html";
    const session = await auth.sesion();
    const email = session && session.user ? session.user.email : null;
    if (!session || !A.isAllowed(email)) {
      window.location.replace(loginUrl);
      return false;
    }
    return true;
  };

  auth.cerrarSesion = async function (loginUrl) {
    await A.client.auth.signOut();
    window.location.replace(loginUrl || "index.html");
  };
})();
