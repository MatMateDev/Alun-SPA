# Alun Uploads API — servicio de subida de documentos (VPS BoxHosting)

Guarda los documentos adjuntos del portal en disco, referenciados a la carpeta
del cliente (`clientes/{clienteId}/{carpeta}/...`). Reemplaza a Cloud Storage
(que exige el plan de pago de Firebase) sin costo adicional al VPS que ya tienes.

Los archivos **no son públicos**: solo se suben/descargan con la sesión de
Firebase Auth del portal (mismo login), y las descargas usan un enlace firmado
que expira en 5 minutos — no hay URL permanente.

## 1) DNS
En BoxHosting (cPanel → Zone Editor), crea un registro:
```
A   archivos   →  <IP pública del VPS>
```

## 2) En el VPS (por SSH)
Instalar Docker (Ubuntu/Debian):
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # cierra sesión y vuelve a entrar tras esto
```

Clonar el repo y entrar a esta carpeta:
```bash
git clone https://github.com/MatErrante/Alun-SPA.git
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
  nano .env   # completa SESSION_SECRET con un valor aleatorio largo, ej:
              #   openssl rand -hex 32
  ```

## 4) Emitir el certificado TLS (una sola vez)
```bash
chmod +x init-cert.sh
./init-cert.sh
```

## 5) Levantar el servicio
```bash
docker compose up -d --build
```

Verificar:
```bash
curl https://archivos.sistema.inversionesalun.cl/api/health
# {"ok":true}
```

## Mantenimiento
- Renovación del certificado: automática (contenedor `certbot`, revisa cada 12h).
- Ver logs: `docker compose logs -f api`
- Actualizar tras cambios en el código: `git pull && docker compose up -d --build`
- Los archivos quedan en el volumen Docker `uploads-data` (persiste entre
  reinicios/actualizaciones; no se borra con `docker compose down` a menos que
  se use `-v`).

## Endpoints
| Método | Ruta | Auth | Uso |
|---|---|---|---|
| POST | `/api/upload` | Bearer (Firebase ID token) | Sube un archivo (`multipart/form-data`: `file`, `clienteId`, `carpeta`) |
| GET | `/api/download-link?path=...` | Bearer | Devuelve un enlace de descarga firmado (expira en 5 min) |
| GET | `/api/file?path=...&exp=...&sig=...` | Firma en la URL | Descarga real del archivo |
| GET | `/api/health` | — | Healthcheck |
