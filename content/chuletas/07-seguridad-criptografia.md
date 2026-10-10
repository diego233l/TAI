# Seguridad y criptografía

## Conceptos

- Propiedades: **C**onfidencialidad, **I**ntegridad, **D**isponibilidad (+ **A**utenticidad y **T**razabilidad en el ENS).
- Riesgo = **probabilidad × impacto**. Tratamiento: mitigar, transferir, evitar, aceptar.
- **MAGERIT** (riesgos; herramienta **PILAR**), **ISO 27001** (SGSI; 93 controles en 2022), **ISO 22301** (continuidad), **ENS** (RD 311/2022).
- Factores de autenticación: **conocimiento**, **posesión**, **inherencia**; MFA = al menos dos categorías.
- Control de acceso: **DAC**, **MAC**, **RBAC**, **ABAC**.

## Criptografía

| Tipo | Clave | Algoritmos | Uso |
|---|---|---|---|
| **Simétrica** | Una | **AES** (128 bits de bloque; claves 128/192/256), ChaCha20; DES (56) y 3DES obsoletos | Cifrar datos |
| **Asimétrica** | Par público/privado | **RSA** (≥ 2048), **ECC/ECDSA** (256 ≈ RSA 3072), **Diffie-Hellman** | Intercambiar claves, firmar |
| **Hash** | Sin clave | **SHA-2**, **SHA-3**; MD5 y SHA-1 rotos; HMAC con clave | Integridad |
| **Contraseñas** | — | **bcrypt, scrypt, Argon2, PBKDF2** con sal | Almacenamiento |

- **Confidencialidad**: se cifra con la **clave pública del receptor**. **Firma**: con la **clave privada del emisor**.
- **Cifrado híbrido**: clave de sesión simétrica protegida con clave pública.
- Modos: **ECB** (no usar), CBC, CTR, **GCM** (autenticado).
- **Firma digital** = autenticidad + integridad + no repudio (no confidencialidad).
- **Poscuántica (NIST 2024)**: ML-KEM, ML-DSA, SLH-DSA.

## PKI y certificados

- X.509: titular, clave pública, emisor, validez, firma de la CA. Revocación: **CRL** y **OCSP**. Sello de tiempo: **RFC 3161**.
- eIDAS: firma **simple**, **avanzada** y **cualificada** (equivale a la manuscrita). Formatos **XAdES, CAdES, PAdES**; niveles **B, T, LT, LTA**.

## TLS

- TLS 1.0/1.1 y SSL obsoletos; **TLS 1.2** vigente; **TLS 1.3** (RFC 8446): 1 RTT, solo AEAD, ECDHE/DHE → **PFS**, cifra el certificado.
- Certificados: DV, OV, EV; wildcard y SAN; cadena servidor → intermedia → raíz; HSTS, OCSP stapling, Certificate Transparency, CAA.
- Ataques históricos: Heartbleed, POODLE, BEAST, CRIME/BREACH, downgrade, SSL stripping.

## Amenazas

Malware: virus, **gusano** (se propaga solo), troyano, **ransomware**, spyware, rootkit, botnet · Ingeniería social: phishing, **spear phishing**, whaling, vishing, smishing · Credenciales: fuerza bruta, **password spraying**, **credential stuffing**, rainbow tables (sal) · Red: MITM, spoofing (ARP/DNS/IP), **DoS/DDoS** (SYN flood, amplificación) · Web: **SQLi, XSS, CSRF** · **Zero-day**, APT, cadena de suministro.

## Perímetro y detección

- Cortafuegos: sin estado (L3-4), **con estado**, proxy/aplicación (L7), **NGFW**, **WAF**, UTM. **Denegar por defecto**; primera coincidencia.
- **DMZ**: servidores públicos; Internet → interna prohibido. Doble cortafuegos (*screened subnet*).
- **IDS** detecta (SPAN/TAP); **IPS** bloquea (en línea). Firmas vs anomalías. **SIEM**, **SOC**, **EDR/XDR**.
- VPN: **IPsec** (AH 51 sin cifrado, ESP 50; transporte/túnel; IKE UDP 500/4500), **OpenVPN** (UDP 1194), **WireGuard** (UDP 51820), L2TP (1701), **PPTP obsoleto**.
- **Zero Trust**: nunca confiar, siempre verificar; ZTNA.

## ENS: medidas citables

| Código | Medida |
|---|---|
| op.acc.3 / op.acc.4 | Segregación de funciones / gestión de derechos de acceso |
| op.exp.2 / 4 / 5 / 6 / 7 | Configuración, mantenimiento y actualizaciones, gestión de cambios, código dañino, incidentes |
| op.cont.1-4 | Análisis de impacto, plan de continuidad, pruebas, medios alternativos |
| op.mon.1 | Detección de intrusión |
| mp.if.1-7 | Áreas separadas, identificación, acondicionamiento, energía, incendios, inundaciones, entrada/salida de equipamiento |
| mp.per.3 / 4 | Concienciación / formación |
| mp.eq.1-4 | Puesto despejado, bloqueo, portátiles, otros dispositivos |
| mp.com.1-4 | Perímetro seguro, confidencialidad, integridad y autenticidad, separación de flujos |
| mp.sw.1 / 2 | Desarrollo de aplicaciones / aceptación y puesta en servicio |
| mp.s.1 / 2 / 3 / 4 | Correo, servicios web, navegación, denegación de servicio |
| mp.info.6 | Copias de seguridad |

## CPD

- **PUE** = energía total / energía TI (→ 1). ASHRAE 18-27 °C. SAI online (doble conversión); redundancia N, N+1, 2N.
- **Tier** I 99,671 %, II 99,741 %, III 99,982 % (mantenimiento concurrente), IV 99,995 % (tolerante a fallos).
- Extinción por gases limpios; CO₂ no en zonas ocupadas.
- Copias **3-2-1** (3-2-1-1-0); incremental / diferencial; **RPO / RTO**.

## Incidentes

- ITIL: incidente (restaurar servicio), **problema** (causa raíz), cambio (RFC, CAB). Prioridad = impacto × urgencia.
- Brecha de datos personales: **72 horas** (art. 33 RGPD). NIS2: **24 h** alerta temprana, 72 h notificación, 1 mes informe final.
