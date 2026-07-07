# Esquema Firestore — Inversiones Alun SpA (consistente con los campos del front)

Cada colección usa como **ID de documento el mismo `id` del front** (ej. `c…`, `co…`, `cu…`, `f…`),
así se preservan las relaciones por `clienteId` / `compraId`. Los archivos NO se guardan en
Firestore (límite 1 MB/doc): van a **Cloud Storage** en carpetas por cliente (ver al final).

## 1) `clientes` (módulo **Clientes**)
Form IDs `cl-*`, `rl-*`, `pf-*`, `ui-*`.
```
id, folio, creadoEn, actualizadoEn, tipoPersona,
fechaLlenado, tipoFicha, nivelDDC,
nombre, rut, tipoSociedad, fechaConstitucion, nacimiento, nacionalidad,
giro, actividad, direccion, comuna, region, pais, telefono, web, email,
repLegal:   { nombre, rut, nacionalidad, profesion, domicilio, correo, telefono },
beneficiarios: [ { id, nombre, rut, nacionalidad, participacion, tipo, cedula, kyc } ],
pep, pepNombre, pepCargo,
perfil:     { proposito, paises, volumenMensual, promedioOperacion, frecuencia, nOpsMes },
origenFondos,
habituales: { ordenanteMismo, destinatarios: [ { nombre, pais, doc, banco, cuenta, relacion } ] },
docs:       { cedulaRL, constitucion, modificaciones[], vigencia, erut, kyb, cedulaTitular, fichaFirmada, adicionales[] },  // → metadatos de archivos en Storage
interno:    { recepcion, proximaRevision, cbpay, cruceListas, resultadoListas, nivelRiesgo, fundamentoRiesgo, observacionesEPD },
observaciones
```

## 2) `registros` (módulos **Nueva transferencia** / **Transferencias**)
Form IDs `ben-*`, `tx-*`.
```
id, folio, creadoEn, actualizadoEn, clienteId, compraId,
beneficiario:   { nombre, documento, pais, ciudad, banco, cuenta },
transferencia:  { fecha, monto, moneda, montoDestino, monedaDestino, referencia, canal, proposito, relacion, observaciones },
// Verificación en listas / billeteras (revisión del destinatario). Si requerida==='si',
// 'resultado' es obligatorio; 'Con coincidencias' obliga a enviar ROS (Circular 62 c.11).
verificacionListas: { requerida ('si'|'no'), resultado ('Sin coincidencias'|'Con coincidencias'|'Observado'), comentario, fecha },
// Pago en efectivo (ROE): equivalente USD obligatorio; roeIncluir=true si ≥ USD 10.000.
pagoEfectivo: ('si'|'no'), usdEquivalente: number|null, roeIncluir: boolean,
// Seguimiento ROS (solo si la verificación dio 'Con coincidencias'):
//  pendiente → enviado {folio} | descartado {justificacion} = "operación sospechosa descartada".
ros: { estado ('pendiente'|'enviado'|'descartado'), folio?, justificacion?, fecha, usuario } | null,
usuario,                // auditoría: email de quien registró (presente en todas las colecciones)
comprobante,            // → archivo en Storage
facturaModo, facturaIndividual, facturaGrupoId,
otros[]                 // → archivos en Storage
```

## 3) `facturas` (módulo **Facturas**)
Form IDs `fac-*` / `nf-*`.
```
id, folio, numero, fecha, clienteId, archivo, creadoEn   // archivo → Storage
```

## 4) `compras` (módulo **Compras y saldos**)
Form IDs `co-*`, `cd-*`, `vd-*`, `lq-*`, `ab-*`.
```
id, folio, creadoEn, clienteId, fecha, valuta, observaciones,
tipoOperacion ('compra_div'|'venta_div'|'liq'), comision, comisionTipo,
monedaCompra, montoCompra, monedaPago, tipoCambio, tcProveedor, contraparte,
montoLiquidar, liqComisionPct, liqTcVenta, liqContraparteVenta, liqTcCompra, liqClpPago, liqContraparteCompra,
gananciaCLP,
abonos: [ { id, fecha, monto, medio, observacion, tipo?, comprobante } ]   // comprobante → Storage
```

## 5) `cuenta` (módulo **Abonos en cuenta**)
Form IDs `cu-*`.
```
id, folio, creadoEn, clienteId, fecha,
tipo ('deposito'|'retiro'|'aplicado'), monto, moneda, medio,
bancoCuentaId, bancoTxt, refCompra?, observacion, comprobante   // comprobante → Storage
```

## 6) Auxiliares
- `counters` — un doc por entidad para los folios correlativos (CL-/OP-/CO-/FAC-/AC-).
- `archivo` — retención 5 años: todo registro eliminado se archiva aquí con
  `{ tipo, clienteId, motivo, eliminadoPor, eliminadoEn, data (registro completo) }`.
- `alertas_descartadas` — auditoría de alertas (umbral/fraccionamiento) descartadas:
  `{ key, justificacion, usuario, fecha }`.
- (Opcional) `proveedores`, `movimientos` (libro de caja), `cuentas_bancarias`.

---

## Almacenamiento de documentos — VPS propio (BoxHosting), no Cloud Storage
Servicio en `/vps-uploads` (Docker + Nginx + Certbot en el VPS de BoxHosting,
`archivos.inversionesalun.cl`). Reemplaza a Cloud Storage para evitar el plan
de pago de Firebase. Todo documento cuelga del cliente en disco:
```
clientes/{clienteId}/ficha/...                 (cédula RL, constitución, vigencia, e-RUT, KYB, …)
clientes/{clienteId}/transferencias/{registroId}/comprobante|otros...
clientes/{clienteId}/facturas/{facturaId}/...
clientes/{clienteId}/compras/{compraId}/abonos/{abonoId}/...
clientes/{clienteId}/cuenta/{movimientoId}/...
```
En Firestore se guarda solo la **ruta** (`storagePath`), nunca el binario ni una
URL permanente. Cada descarga requiere sesión activa y genera un enlace firmado
que expira en 5 minutos (`A.linkDescargaTemporal(storagePath)`) — los archivos
viven únicamente en el VPS; el front no los retiene entre sesiones.
