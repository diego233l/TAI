# Redes: OSI, TCP/IP y subnetting

## OSI y PDU

| Capa | PDU | Ejemplos |
|---|---|---|
| 7 Aplicación | Datos | HTTP, SMTP, DNS |
| 6 Presentación | Datos | Cifrado, compresión, codificación |
| 5 Sesión | Datos | NetBIOS, RPC |
| 4 Transporte | Segmento / datagrama | TCP, UDP |
| 3 Red | Paquete | IP, ICMP, router |
| 2 Enlace | Trama | Ethernet, switch |
| 1 Física | Bits | Cable, hub |

TCP/IP: **Aplicación, Transporte, Internet, Acceso a la red**.

## Subnetting

- **Hosts útiles = 2^(32−p) − 2**.
- **Bloque** = 256 − octeto de la máscara en el octeto «interesante».

| Prefijo | Máscara | Hosts |
|---|---|---|
| /30 | .252 | 2 |
| /29 | .248 | 6 |
| /28 | .240 | 14 |
| /27 | .224 | 30 |
| /26 | .192 | 62 |
| /25 | .128 | 126 |
| /24 | 255.255.255.0 | 254 |
| /23 | 255.255.254.0 | 510 |
| /22 | 255.255.252.0 | 1022 |
| /16 | 255.255.0.0 | 65 534 |

**Método rápido**: red = múltiplo del bloque ≤ dirección; difusión = siguiente red − 1; hosts = red+1 … difusión−1.

## Direcciones especiales

- Privadas: **10.0.0.0/8**, **172.16.0.0/12**, **192.168.0.0/16** · APIPA **169.254.0.0/16** · Loopback **127.0.0.0/8** · CGNAT **100.64.0.0/10** · Multicast **224.0.0.0/4**.
- Clases: A 1-126, B 128-191, C 192-223, D 224-239, E 240-255.
- IPv6: **128 bits**; `::` una sola vez; link-local `fe80::/10`; ULA `fc00::/7`; global `2000::/3`; multicast `ff00::/8`; loopback `::1`; sin broadcast; subred típica /64; NDP sustituye a ARP.

## TCP / UDP

- TCP: **SYN → SYN-ACK → ACK**; cierre FIN/ACK o RST; ventana deslizante; cabecera 20-60 B.
- UDP: sin conexión; cabecera **8 B**.
- ICMP: echo request 8 / reply 0; destino inalcanzable 3; tiempo excedido 11 (traceroute).

## Ethernet y LAN

- MAC de 48 bits; trama **64-1518 B** (1522 con 802.1Q); MTU 1500.
- **802.1Q**: etiqueta de 4 B, VID de 12 bits (**4094** VLAN).
- **STP**: raíz = menor Bridge ID; 802.1D 30-50 s; RSTP 802.1w rápido; PortFast + BPDU Guard.
- LACP 802.3ad · PoE af 15,4 W / at 30 W / bt 60-90 W.
- CSMA/CD (Ethernet half-dúplex) · CSMA/CA (Wi-Fi).

## Cableado

100 m por enlace · Cat 5e 1G · Cat 6 10G a 55 m · **Cat 6A 10G a 100 m** · fibra OM3 10G 300 m / OM4 400 m · monomodo 9/125 µm.

## Wi-Fi

b 11 Mbit/s (2,4) · a 54 (5) · g 54 (2,4) · n Wi-Fi 4 · ac Wi-Fi 5 · ax Wi-Fi 6/6E (6 GHz, OFDMA) · be Wi-Fi 7. Seguridad: WEP (roto) < WPA < WPA2 (AES-CCMP) < **WPA3 (SAE)**.

## Encaminamiento

RIP (saltos, máx. 15, UDP 520) · OSPF (estado de enlace, Dijkstra, área 0, IP 89) · BGP (TCP 179, entre AS). Distancia administrativa: conectada 0, estática 1, eBGP 20, EIGRP 90, OSPF 110, RIP 120. **Longest prefix match**.
