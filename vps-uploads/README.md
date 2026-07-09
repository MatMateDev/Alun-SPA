# Alun Backend — datos y documentos (VPS BoxHosting)

Todo lo que el portal guarda vive aquí, en tu propio VPS:
- **Datos** (clientes, transferencias, facturas, compras, cuenta, archivo de
  retención UAF, alertas descartadas) → **Postgres** (contenedor `db`).
- **Documentos adjuntos** → disco, referenciados a la carpeta del cliente
  (`clientes/{clienteId}/{carpeta}/...`).

El **login** (correo + contraseña) sigue en **Firebase Authentication**; este
servicio solo **verifica esa sesión** (token) en cada operación — no hay
Firestore ni Cloud Storage. Los archivos no son públicos: suben/descargan solo
con sesión válida, y las descargas usan un enlace firmado que expira en 5
minutos — no hay URL permanente.

## 1) DNS
En BoxHosting (cPanel → Zone Editor), crea un registro:
```
A   archivos   →  <IP pública del VPS>
```
(en este proyecto quedó como `archivos.sistema.inversionesalun.cl`, según la
zona que administra el cPanel — ajusta el nombre si el tuyo es distinto).

## 2) En el VPS (por SSH)
Instalar Docker (Ubuntu/Debian; en AlmaLinux/RHEL usa `dnf` con el repo de
`download.docker.com/linux/centos`):
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # cierra sesión y vuelve a entrar tras esto
```

Clonar el repo y entrar a esta carpeta:
```bash
git clone https://github.com/MatMateDev/Alun-SPA.git
cd Alun-SPA/vps-uploads
```

## 3) Credenciales (NUNCA se suben a git)
- **Clave de Firebase Admin**: Firebase Console → ⚙️ Configuración del proyecto
  → Cuentas de servicio → **Generar nueva clave privada** (descarga un JSON).
  ```bash
  mkdir -p secrets
  nano secrets/firebase-service-account.json   # pega el contenido del JSON descargado
  ```
- **Variables de entorno**:
  ```bash
  cp .env.example .env
  nano .env
  # Completa SESSION_SECRET y POSTGRES_PASSWORD con valores aleatorios, ej:
  #   openssl rand -hex 32
  # y refleja la misma contraseña en DATABASE_URL (postgres://alun:LA_MISMA@db:5432/alun)
  ```

## 4) Emitir el certificado TLS (una sola vez)
```bash
chmod +x init-cert.sh
./init-cert.sh
```

## 5) Levantar todo (Postgres + API + Nginx)
```bash
docker compose up -d --build
```
La primera vez, Postgres ejecuta automáticamente `db/init.sql` (crea las
tablas). Verificar:
```bash
curl https://archivos.sistema.inversionesalun.cl/api/health
# {"ok":true}
```

## Mantenimiento
- Renovación del certificado: automática (contenedor `certbot`, revisa cada 12h).
- Ver logs: `docker compose logs -f api` · `docker compose logs -f db`
- Actualizar tras cambios en el código: `git pull && docker compose up -d --build`
- Los archivos quedan en el volumen Docker `uploads-data`; los datos en `pgdata`
  (ambos persisten entre reinicios/actualizaciones; no se borran con
  `docker compose down` a menos que se use `-v`).
- Respaldo de la base de datos: `docker compose exec db pg_dump -U alun alun > respaldo.sql`
- Ver los datos guardados: `docker compose exec db psql -U alun -d alun -c "select id, data->>'nombre' from clientes;"`

## Endpoints

**Documentos**
| Método | Ruta | Auth | Uso |
|---|---|---|---|
| POST | `/api/upload` | Bearer (Firebase ID token) | Sube un archivo (`multipart/form-data`: `file`, `clienteId`, `carpeta`) |
| GET | `/api/download-link?path=...` | Bearer | Enlace de descarga firmado (expira en 5 min) |
| GET | `/api/file?path=...&exp=...&sig=...` | Firma en la URL | Descarga real del archivo |

**Datos** (colecciones: `clientes`, `registros`, `facturas`, `compras`, `cuenta`, `archivo`, `alertas_descartadas`)
| Método | Ruta | Auth | Uso |
|---|---|---|---|
| GET | `/api/data/:col` | Bearer | Lista todos los documentos de la colección |
| PUT | `/api/data/:col/:id` | Bearer | Crea/actualiza un documento (el servidor asigna el folio si es nuevo) |
| DELETE | `/api/data/:col/:id` | Bearer | Elimina un documento |

**General**
| Método | Ruta | Auth | Uso |
|---|---|---|---|
| GET | `/api/health` | — | Healthcheck |
