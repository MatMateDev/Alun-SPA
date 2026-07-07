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
// Pago en efectivo (ROE): 'si' incluye la operación en el Reporte de Operaciones en Efectivo (≥ USD 10.000).
pagoEfectivo: ('si'|'no'),
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
- (Opcional) `proveedores`, `movimientos` (libro de caja), `cuentas_bancarias`.

---

## Cloud Storage — carpetas ligadas al cliente
Bucket del proyecto `inversiones-alun-spa`. Todo documento cuelga del cliente:
```
clientes/{clienteId}/ficha/...                 (cédula RL, constitución, vigencia, e-RUT, KYB, …)
clientes/{clienteId}/transferencias/{registroId}/comprobante|otros...
clientes/{clienteId}/facturas/{facturaId}/...
clientes/{clienteId}/compras/{compraId}/abonos/{abonoId}/...
clientes/{clienteId}/cuenta/{movimientoId}/...
```
En Firestore se guarda solo la **ruta** (`storagePath`) y la URL de descarga, no el binario.
