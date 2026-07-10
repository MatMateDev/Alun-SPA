/* ============================================================================
 *  Alun Backend API — VPS BoxHosting
 * ----------------------------------------------------------------------------
 *  1) Documentos: guarda archivos en disco, referenciados a la carpeta del
 *     cliente (/data/clientes/{clienteId}/{carpeta}/{timestamp}_{nombre}).
 *     Descargas via enlace firmado de 5 minutos (no hay URL permanente).
 *  2) Datos: TODOS los registros de la app (clientes, transferencias,
 *     facturas, compras, cuenta, archivo, alertas) viven en Postgres
 *     (tablas id + jsonb, ver db/init.sql) — reemplaza a Firestore.
 *  El login sigue en Firebase Auth; este servicio solo VERIFICA esa sesión
 *  (verifyIdToken) en cada operación, tanto de archivos como de datos.
 * ========================================================================== */
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const cors = require("cors");
const admin = require("firebase-admin");
const { Pool } = require("pg");

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
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const app = express();
app.use(cors({ origin: ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : false }));
app.use(express.json({ limit: "50mb" }));

// Log de cada petición (visible con: docker compose logs -f api).
app.use((req, res, next) => {
  res.on("finish", () => {
    console.log(new Date().toISOString(), req.method, req.originalUrl.split("?")[0], res.statusCode);
  });
  next();
});

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

// ============================================================================
//  DATOS — registro compartido: clientes, transferencias, facturas, compras,
//  cuenta, archivo (retención UAF) y alertas descartadas. Un documento por
//  fila (jsonb), igual forma que usaba el front con Firestore.
// ============================================================================
const COLECCIONES = ["clientes", "registros", "facturas", "compras", "cuenta", "archivo", "alertas_descartadas"];
// Folio autoritativo del servidor (evita choques entre distintos equipos/usuarios).
const FOLIOS = {
  clientes: { prefijo: "CL-", pad: 5 },
  compras: { prefijo: "CO-", pad: 6 },
  registros: { prefijo: "OP-", pad: 6 },
  facturas: { prefijo: "FAC-", pad: 5 },
  cuenta: { prefijo: "AC-", pad: 6 },
};

async function siguienteFolio(client, entity) {
  const { rows } = await client.query(
    "insert into counters(entity, n) values ($1, 1) on conflict (entity) do update set n = counters.n + 1 returning n",
    [entity]
  );
  const cfg = FOLIOS[entity];
  return cfg.prefijo + String(rows[0].n).padStart(cfg.pad, "0");
}

// Lista todos los documentos de una colección.
app.get("/api/data/:col", requiereSesion, async (req, res) => {
  const col = req.params.col;
  if (!COLECCIONES.includes(col)) return res.status(400).json({ error: "Colección inválida." });
  try {
    const { rows } = await pool.query("select data from " + col + " order by updated_at desc");
    res.json({ items: rows.map((r) => r.data) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Crea o actualiza un documento. Reglas del servidor (fuente de verdad):
//  - Folio: si es nuevo, se asigna atómicamente (lock por registro evita
//    correlativos duplicados/quemados); si ya existe, se conserva el original.
//  - Versiones (LWW): una copia con actualizadoEn MÁS ANTIGUO que lo almacenado
//    no pisa los datos — se responde la versión vigente con ignorado:true.
app.put("/api/data/:col/:id", requiereSesion, async (req, res) => {
  const col = req.params.col;
  const id = String(req.params.id || "");
  if (!COLECCIONES.includes(col) || !idSeguro(id)) return res.status(400).json({ error: "Colección o id inválidos." });
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [col + ":" + id]);
    const existente = await client.query("select data from " + col + " where id = $1", [id]);
    const data = Object.assign({}, req.body, { id });
    if (existente.rows.length) {
      const prev = existente.rows[0].data || {};
      if (prev.folio) data.folio = prev.folio;
      if (prev.actualizadoEn && data.actualizadoEn && data.actualizadoEn < prev.actualizadoEn) {
        await client.query("commit");
        return res.json({ ok: true, ignorado: true, data: prev });
      }
    } else if (FOLIOS[col]) {
      data.folio = await siguienteFolio(client, col);
    }
    await client.query(
      "insert into " + col + " (id, data, updated_at) values ($1, $2, now()) " +
      "on conflict (id) do update set data = $2, updated_at = now()",
      [id, data]
    );
    await client.query("commit");
    res.json({ ok: true, data });
  } catch (e) {
    try { await client.query("rollback"); } catch (_) {}
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

app.delete("/api/data/:col/:id", requiereSesion, async (req, res) => {
  const col = req.params.col;
  const id = String(req.params.id || "");
  if (!COLECCIONES.includes(col) || !idSeguro(id)) return res.status(400).json({ error: "Colección o id inválidos." });
  try {
    await pool.query("delete from " + col + " where id = $1", [id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log("Alun backend API escuchando en :" + PORT));
