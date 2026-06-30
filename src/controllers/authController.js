/* ============================================================================
 *  CONTROLLER · Autenticación con email + contraseña (Firebase Auth)
 *  Inversiones Alun SpA — Portal interno UAF
 * ----------------------------------------------------------------------------
 *  - login(email, password): inicia sesión.
 *  - guard(): protege app.html; redirige a index.html si no hay sesión.
 *  - cerrarSesion(): signOut y vuelta al login.
 * ========================================================================== */
(function () {
  "use strict";
  const A = (window.Alun = window.Alun || {});
  const auth = (A.auth = {});

  function traducir(code) {
    switch (code) {
      case "auth/invalid-email": return "El correo no es válido.";
      case "auth/user-disabled": return "Este usuario está deshabilitado.";
      case "auth/user-not-found":
      case "auth/wrong-password":
      case "auth/invalid-credential": return "Correo o contraseña incorrectos.";
      case "auth/too-many-requests": return "Demasiados intentos. Espera unos minutos.";
      case "auth/network-request-failed": return "Error de red. Revisa tu conexión.";
      default: return "No se pudo iniciar sesión. Intenta nuevamente.";
    }
  }

  auth.login = async function (email, password) {
    if (!A.isAllowed(email)) {
      return { ok: false, error: "Este correo no está autorizado para ingresar." };
    }
    try {
      await A.authClient.signInWithEmailAndPassword(email.trim(), password);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: traducir(e && e.code) };
    }
  };

  // Devuelve el usuario actual cuando Firebase resuelve el estado de sesión.
  auth.sesion = function () {
    return new Promise((resolve) => {
      const unsub = A.authClient.onAuthStateChanged((user) => {
        unsub();
        resolve(user || null);
      });
    });
  };

  // Protege una página: sin sesión válida y autorizada, redirige al login.
  auth.guard = async function (loginUrl) {
    loginUrl = loginUrl || "index.html";
    const user = await auth.sesion();
    if (!user || !A.isAllowed(user.email)) {
      window.location.replace(loginUrl);
      return false;
    }
    return true;
  };

  auth.cerrarSesion = async function (loginUrl) {
    await A.authClient.signOut();
    window.location.replace(loginUrl || "index.html");
  };
})();
