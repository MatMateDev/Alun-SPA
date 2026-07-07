/* ============================================================================
 *  Alun Uploads API — servicio de subida de documentos (VPS BoxHosting)
 * ----------------------------------------------------------------------------
 *  Guarda los archivos en disco, referenciados a la carpeta del cliente:
 *    /data/clientes/{clienteId}/{carpeta}/{timestamp}_{nombre}
 *  Los archivos NO son públicos: toda subida y toda descarga requieren un
 *  token de sesión de Firebase Auth (el mismo login del portal). Las
 *  descargas se resuelven con un enlace firmado y de corta duración
 *  (5 minutos) — no hay URL permanente, tal como pide el diseño (los
 *  archivos viven en el back; el front solo los usa por sesión).
 * ========================================================================== */
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const cors = require("cors");
const admin = require("firebase-admin");

const PORT = process.env.PORT || 3001;
const DATA_DIR = process.env.DATA_DIR || "/data";
const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS || "")
  .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",").map((s) => s.trim()).filter(Boolean);
const ALLOWED_CARPETAS = ["ficha", "transferencias", "facturas", "compras", "cuenta", "alertas", "archivo"];
const MAX_FILE_MB = parseInt(process.env.MAX_FILE_MB || "200", 10);
const SESSION_SECRET = process.env.SESSION_SECRET || "";
const LINK_TTL_MS = 5 * 60 * 1000; // enlace de descarga válido solo 5 minutos

if (!SESSION_SECRET) { console.error("Falta SESSION_SECRET en el entorno."); process.exit(1); }

admin.initializeApp({ credential: admin.credential.applicationDefault() });

const app = express();
app.use(cors({ origin: ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : false }));

const idSeguro = (s) => typeof s === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(s);

// Verifica el token de sesión de Firebase y que el correo esté autorizado.
async function requiereSesion(req, res, next) {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Falta token de sesión." });
    const decoded = await admin.auth().verifyIdToken(token);
    if (!decoded.email || !ALLOWED_EMAILS.includes(decoded.email.toLowerCase())) {
      return res.status(403).json({ error: "Correo no autorizado." });
    }
    req.usuario = decoded.email;
    next();
  } catch (e) {
    res.status(401).json({ error: "Sesión inválida o expirada." });
  }
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const { clienteId, carpeta } = req.body;
    if (!idSeguro(clienteId) || !ALLOWED_CARPETAS.includes(carpeta)) {
      return cb(new Error("clienteId o carpeta inválidos"));
    }
    const dir = path.join(DATA_DIR, "clientes", clienteId, carpeta);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const seguro = (file.originalname || "archivo").replace(/[^a-zA-Z0-9_.-]/g, "_").slice(-120);
    cb(null, Date.now() + "_" + seguro);
  },
});
const upload = multer({ storage, limits: { fileSize: MAX_FILE_MB * 1024 * 1024 } });

// Sube un documento y lo referencia al cliente (carpeta clientes/{clienteId}/{carpeta}).
app.post("/api/upload", requiereSesion, (req, res) => {
  upload.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || "No se pudo subir el archivo." });
    if (!req.file) return res.status(400).json({ error: "No se recibió ningún archivo." });
    const rel = path.relative(DATA_DIR, req.file.path).split(path.sep).join("/");
    res.json({ ok: true, nombre: req.file.originalname, storagePath: rel, size: req.file.size, usuario: req.usuario });
  });
});

function firmar(rel, exp) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(rel + "|" + exp).digest("hex");
}

// Genera un enlace de descarga firmado, válido solo 5 minutos (sesión, no permanente).
app.get("/api/download-link", requiereSesion, (req, res) => {
  const rel = String(req.query.path || "");
  if (!rel || rel.includes("..") || !rel.startsWith("clientes/")) return res.status(400).json({ error: "Ruta inválida." });
  const abs = path.join(DATA_DIR, rel);
  if (!fs.existsSync(abs)) return res.status(404).json({ error: "Archivo no encontrado." });
  const exp = Date.now() + LINK_TTL_MS;
  const sig = firmar(rel, exp);
  res.json({ url: "/api/file?path=" + encodeURIComponent(rel) + "&exp=" + exp + "&sig=" + sig });
});

// Descarga real: valida la firma y la expiración (no requiere cabecera Authorization,
// porque los enlaces <a download> del navegador no la envían).
app.get("/api/file", (req, res) => {
  const rel = String(req.query.path || "");
  const exp = String(req.query.exp || "");
  const sig = String(req.query.sig || "");
  if (!rel || !exp || !sig) return res.status(400).end();
  if (Date.now() > Number(exp)) return res.status(403).send("Enlace expirado.");
  if (firmar(rel, exp) !== sig) return res.status(403).send("Enlace inválido.");
  const abs = path.join(DATA_DIR, rel);
  if (!abs.startsWith(path.join(DATA_DIR, "clientes"))) return res.status(400).end();
  if (!fs.existsSync(abs)) return res.status(404).end();
  res.download(abs);
});

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log("Alun uploads API escuchando en :" + PORT));
