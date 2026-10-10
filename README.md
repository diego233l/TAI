# TAI · Preparación de la oposición (Técnicos Auxiliares de Informática, C1, AGE)

Aplicación web de estudio de un solo usuario: temario completo (33 temas, 4 bloques),
bancos de preguntas, tarjetas con repaso espaciado, simulacros con la estructura y la
puntuación del examen real, supuestos prácticos (bloques III y IV), plan de estudio,
estadísticas, glosario, chuletas, normativa y herramientas (calculadora de subredes, etc.).

Sin Composer, sin npm y sin paso de compilación: PHP 8.3 + SQLite + JavaScript plano.

## Actualizar

```sh
git -C /opt/apps/tai pull
```

Es todo. El código y el contenido se leen del repositorio en cada petición, así que el
cambio está en producción al instante. No hay que reiniciar nada, ni scripts de despliegue,
ni releases, ni unidades systemd propias. Las migraciones de la base de datos se aplican
solas la primera vez que se accede tras una actualización.

## Instalación (una sola vez)

Requisitos: nginx, PHP-FPM y git. Con el instalador:

```sh
git clone -b <rama> https://github.com/diego233l/TAI.git /opt/apps/tai
sudo /opt/apps/tai/install.sh              # puerto 8082; otro: sudo PORT=8090 /opt/apps/tai/install.sh
```

`install.sh` detecta el socket de PHP-FPM, instala `phpX.Y-sqlite3` si falta, crea
`/var/lib/tai` (propiedad de `www-data`), añade su propio `conf.d/tai.conf`, valida con
`nginx -t` y recarga. Es idempotente, rechaza un puerto ocupado y, si la configuración
no es válida, deshace su cambio: no toca las demás webs del servidor.

A mano, equivale a:

```sh
install -d -o www-data -g www-data -m 750 /var/lib/tai
ln -s /opt/apps/tai/nginx/tai.conf /etc/nginx/conf.d/tai.conf
nginx -t && systemctl reload nginx
```

Abre `http://servidor:8082/`. Ajusta en `nginx/tai.conf` el socket de PHP-FPM
(`ls /run/php/`) y, si el puerto es accesible desde Internet, activa el bloque
`auth_basic` que viene comentado (la app no tiene login propio).
`www-data` debe poder leer `/opt/apps/tai`.

## Aislamiento

| Qué | Dónde |
|---|---|
| Código y contenido | `/opt/apps/tai` (solo `public/` es accesible desde la web) |
| Datos (SQLite, WAL) | `/var/lib/tai` (propiedad de `www-data`) |
| Sitio nginx | `nginx/tai.conf`, puerto `8082` |
| PHP | `open_basedir` limitado a la app, los datos y `/tmp` |

Copia de seguridad: desde la pantalla de Ajustes (exportar/importar JSON) o copiando
`/var/lib/tai`.

## Contenido

Todo el contenido son ficheros de texto editables en `content/`:

- `temario.json`: bloques, temas y parámetros del examen.
- `temas/*.md`: apuntes de cada tema.
- `preguntas/*.txt`: preguntas tipo test. Formato:
  ```
  ? Enunciado
  a) …
  b) …
  c) …
  d) …
  = b
  > Explicación
  @ Referencia
  ```
- `tarjetas/*.txt`: una por línea, `anverso :: reverso`.
- `supuestos/*.txt`: `@title`, `@block`, `@topics`, `@enunciado … @fin` y sus preguntas.
- `glosario.txt` (`## Categoría` y `término :: definición`), `chuletas/*.md`, `normativa.json`.

Para comprobar que el contenido es coherente antes de hacer commit:

```sh
php tests/validate.php        # estructura, duplicados, respuestas, enlaces entre ficheros
php tests/unit.php            # puntuación, repaso espaciado, subredes, plan
```

## Examen de referencia

Convocatoria BOE-A-2025-26262: 120 minutos; primer ejercicio de 80 preguntas tipo test
(+5 de reserva) de los cuatro bloques; segundo ejercicio con supuesto práctico (a elegir
Bloque III o IV) de 20 preguntas (+5 de reserva). Cada error resta 1/3 y las respuestas
en blanco no puntúan. Cada ejercicio puntúa de 0 a 50 y requiere un mínimo de 25.
Los simulacros de la aplicación replican esta estructura.

## Aviso

Los apuntes y las preguntas se han redactado y contrastado con las fuentes oficiales
disponibles (BOE, EUR-Lex, RFC, W3C…), pero la normativa cambia. Antes del examen,
contrasta los datos sensibles a la legislación (plazos, importes, órganos, versiones
vigentes) con la norma consolidada: la sección «Normativa» enlaza a las fuentes.
Este proyecto no está afiliado a ninguna administración.
