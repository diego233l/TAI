# Comparativas rápidas

## Redes y transporte

| TCP | UDP |
|---|---|
| Orientado a conexión, fiable, ordenado | Sin conexión, sin garantías |
| Control de flujo y congestión | Sin control |
| Cabecera 20-60 B | Cabecera 8 B |
| Web, correo, ficheros | DNS, DHCP, NTP, VoIP, QUIC |

| Hub | Switch | Router |
|---|---|---|
| Capa 1; un dominio de colisión | Capa 2; un dominio de colisión por puerto | Capa 3; separa dominios de difusión |

| Policing | Shaping |
|---|---|
| Descarta o remarca el exceso | Almacena y retrasa el exceso |

## Servicios web

| SOAP | REST |
|---|---|
| Protocolo XML + WSDL + WS-Security | Estilo arquitectónico; JSON habitual; HTTP |
| Contrato estricto | OpenAPI opcional |
| Seguridad a nivel de mensaje | TLS + OAuth 2.0 / JWT |

Métodos HTTP: **GET** seguro e idempotente · **POST** ni seguro ni idempotente · **PUT / DELETE** idempotentes.
Códigos: 200, 201, 204 · 301 permanente, 302/307 temporal, 304 no modificado · 400, **401** (no autenticado), **403** (prohibido), 404, 429 · 500, 502, 503, 504.

## HTTP

| Versión | Claves |
|---|---|
| 1.0 | Una conexión por petición |
| 1.1 | Conexiones persistentes; `Host` obligatoria |
| 2 | Binario; multiplexación; HPACK |
| 3 | QUIC sobre UDP; TLS 1.3 integrado |

Caché: `no-store` (no almacenar) ≠ `no-cache` (almacenar y revalidar); `ETag` → **304**.

## Copias de seguridad

| Tipo | Copia | Restauración |
|---|---|---|
| Completa | Lenta y voluminosa | Rápida |
| Diferencial (desde la última completa) | Media | Completa + último diferencial |
| Incremental (desde la última de cualquier tipo) | Rápida | Completa + **todos** los incrementales |

## RAID

| Nivel | Tolera | Mínimo de discos |
|---|---|---|
| 0 | Ningún fallo | 2 |
| 1 | 1 por espejo | 2 |
| 5 | 1 | 3 |
| 6 | 2 | 4 |
| 10 | 1 por espejo | 4 |

## Almacenamiento

| DAS | NAS | SAN |
|---|---|---|
| Directo | Fichero (NFS, SMB) | Bloque (Fibre Channel, iSCSI) |

## Virtualización

| Hipervisor tipo 1 | Hipervisor tipo 2 | Contenedor |
|---|---|---|
| Sobre el hardware (ESXi, Hyper-V, KVM) | Sobre un SO (VirtualBox) | Comparte el núcleo; ligero |

| VDI | RDS |
|---|---|
| Una VM por usuario | Sesiones sobre un servidor compartido |

## Scrum

- Roles: **Product Owner**, **Scrum Master**, **Developers**.
- Eventos: **Sprint** (≤ 1 mes), Planning, **Daily (15 min)**, Review, Retrospective.
- Artefactos: Product Backlog, Sprint Backlog, Incremento (+ Definition of Done).

## Pruebas

Caja negra: partición de equivalencia, **valores límite**. Caja blanca: cobertura de sentencias, ramas, caminos; **V(G) = decisiones + 1**. TDD rojo-verde-refactorizar. Regresión = no romper lo anterior. Humo = build básico.

## Programación y POO

| Sobrecarga | Sobrescritura |
|---|---|
| Mismo nombre, distinta firma; compilación | Misma firma en la subclase; ejecución (enlace dinámico) |

| Agregación | Composición |
|---|---|
| Partes viven sin el todo | Partes mueren con el todo |

SOLID: **S**ingle responsibility · **O**pen/closed · **L**iskov · **I**nterface segregation · **D**ependency inversion.

## Normalización

1FN atómico → 2FN sin parciales → 3FN sin transitivas → FNBC todo determinante es clave candidata.
