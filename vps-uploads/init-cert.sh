#!/bin/sh
# Emite el primer certificado TLS de Let's Encrypt para archivos.sistema.inversionesalun.cl.
# Ejecutar UNA vez, después de que el DNS ya resuelva al VPS. Requiere docker compose.
set -e
DOMAIN="archivos.sistema.inversionesalun.cl"
EMAIL="felgonzpu@gmail.com"

mkdir -p nginx/conf.d
cp nginx/bootstrap.conf nginx/conf.d/app.conf

docker compose up -d nginx
echo "Esperando a que nginx responda..."
sleep 3

docker compose run --rm certbot certonly \
  --webroot -w /var/www/certbot \
  -d "$DOMAIN" --email "$EMAIL" --agree-tos --no-eff-email

cp nginx/ssl.conf nginx/conf.d/app.conf
docker compose restart nginx

echo "Certificado emitido y nginx recargado con HTTPS."
