#!/usr/bin/env bash
# Instalador de TAI (se ejecuta UNA vez; las actualizaciones son `git -C /opt/apps/tai pull`).
#
#   git clone -b <rama> https://github.com/diego233l/TAI.git /opt/apps/tai
#   sudo /opt/apps/tai/install.sh            # o:  PORT=8090 sudo -E ./install.sh
#
# Es idempotente y respetuoso con las otras webs de la máquina: no toca sus sitios,
# no reinicia nada (solo `nginx -s reload` tras validar la configuración) y, si algo
# falla, deshace su propio cambio de nginx.
#
# Variables opcionales: PORT (por defecto el primer libre desde 8082), APP_DIR (/opt/apps/tai), DATA_DIR (/var/lib/tai),
# PHP_SOCK (se detecta), WEB_USER (www-data).
set -euo pipefail

PORT_FIXED="${PORT:-}"
PORT="${PORT:-8082}"
APP_DIR="${APP_DIR:-/opt/apps/tai}"
DATA_DIR="${DATA_DIR:-/var/lib/tai}"
WEB_USER="${WEB_USER:-www-data}"
CONF_LINK="/etc/nginx/conf.d/tai.conf"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

say() { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "ejecútalo como root (sudo)."
command -v nginx >/dev/null || die "nginx no está instalado."
command -v git >/dev/null || die "git no está instalado."
id "$WEB_USER" >/dev/null 2>&1 || die "no existe el usuario $WEB_USER (usa WEB_USER=...)."

# 1. Código en APP_DIR ---------------------------------------------------------
if [ "$SRC_DIR" != "$APP_DIR" ]; then
    if [ -d "$APP_DIR/.git" ]; then
        say "Ya existe $APP_DIR: se conserva (actualiza con git pull)."
    else
        [ ! -e "$APP_DIR" ] || [ -z "$(ls -A "$APP_DIR")" ] || die "$APP_DIR existe y no está vacío."
        url="$(git -C "$SRC_DIR" remote get-url origin)"
        branch="$(git -C "$SRC_DIR" rev-parse --abbrev-ref HEAD)"
        say "Clonando $url ($branch) en $APP_DIR"
        mkdir -p "$(dirname "$APP_DIR")"
        git clone -q -b "$branch" "$url" "$APP_DIR"
    fi
fi
[ -f "$APP_DIR/nginx/tai.conf" ] || die "no encuentro $APP_DIR/nginx/tai.conf"

# 2. PHP-FPM y extensión SQLite -------------------------------------------------
PHP_SOCK="${PHP_SOCK:-$(ls /run/php/php*-fpm.sock 2>/dev/null | sort -V | tail -1 || true)}"
[ -n "$PHP_SOCK" ] || die "no encuentro el socket de PHP-FPM en /run/php/ (instala php-fpm o usa PHP_SOCK=...)."
PHPV="$(basename "$PHP_SOCK" | sed -E 's/^php([0-9.]+)-fpm\.sock$/\1/')"
say "PHP-FPM: $PHP_SOCK"
if ! "php$PHPV" -m 2>/dev/null | grep -qi '^pdo_sqlite$'; then
    command -v apt-get >/dev/null || die "falta la extensión pdo_sqlite de PHP $PHPV."
    say "Instalando php$PHPV-sqlite3"
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "php$PHPV-sqlite3" >/dev/null
fi

# 3. Puerto libre ---------------------------------------------------------------
# Si ya hay un tai.conf propio, se reutiliza su puerto; si no, y no se fijó PORT,
# se toma el primer puerto libre desde el 8082.
busy() { ss -ltn 2>/dev/null | awk '{print $4}' | grep -Eq "[:.]$1\$"; }
if [ -e "$CONF_LINK" ]; then
    [ -n "$PORT_FIXED" ] || PORT="$(grep -Eo 'listen +[0-9]+' "$CONF_LINK" | head -1 | grep -Eo '[0-9]+')"
elif [ -n "$PORT_FIXED" ]; then
    ! busy "$PORT" || die "el puerto $PORT ya está en uso. Elige otro: PORT=8090 sudo -E $0"
else
    while busy "$PORT"; do PORT=$((PORT + 1)); [ "$PORT" -le 8199 ] || die "no hay puertos libres entre 8082 y 8199."; done
    say "Puerto $PORT (los anteriores están ocupados)"
fi

# 4. Datos fuera del repositorio ------------------------------------------------
say "Datos en $DATA_DIR"
install -d -o "$WEB_USER" -g "$WEB_USER" -m 750 "$DATA_DIR"

# 5. Sitio nginx propio ---------------------------------------------------------
# Si puerto, rutas o socket coinciden con los de tai.conf se enlaza el fichero del
# repositorio (así el git pull también lo actualiza); si no, se genera una copia adaptada.
grep -Eq "include .*/conf\.d/\*\.conf|include .*conf\.d" /etc/nginx/nginx.conf \
    || die "nginx.conf no incluye /etc/nginx/conf.d/*.conf; añade esa línea en el bloque http."
backup=""
[ -e "$CONF_LINK" ] && backup="$(mktemp)" && cp -P "$CONF_LINK" "$backup" 2>/dev/null || true
rm -f "$CONF_LINK"
if [ "$PORT" = 8082 ] && [ "$APP_DIR" = /opt/apps/tai ] && [ "$DATA_DIR" = /var/lib/tai ] \
   && [ "$PHP_SOCK" = /run/php/php8.3-fpm.sock ]; then
    ln -s "$APP_DIR/nginx/tai.conf" "$CONF_LINK"
else
    sed -e "s#/opt/apps/tai#$APP_DIR#g" -e "s#/var/lib/tai#$DATA_DIR#g" \
        -e "s#listen 8082;#listen $PORT;#" -e "s#unix:/run/php/php8\.3-fpm\.sock#unix:$PHP_SOCK#" \
        "$APP_DIR/nginx/tai.conf" > "$CONF_LINK"
    say "Configuración adaptada (copia, no enlace): $CONF_LINK"
fi

if nginx -t >/dev/null 2>&1; then
    { systemctl reload nginx 2>/dev/null || nginx -s reload; } || die "no he podido recargar nginx (¿está en marcha?). La configuración ya está en $CONF_LINK."
else
    nginx -t || true
    rm -f "$CONF_LINK"
    [ -n "$backup" ] && [ -s "$backup" ] && cp "$backup" "$CONF_LINK"
    die "la configuración de nginx no es válida; he deshecho el cambio. Tus otras webs no se han tocado."
fi

# 6. Comprobación ---------------------------------------------------------------
sleep 1
if curl -fsS "http://127.0.0.1:$PORT/api/health" | grep -q '"ok":true'; then
    say "TAI funcionando en http://$(hostname -I 2>/dev/null | awk '{print $1}'):$PORT/"
else
    die "nginx recarga bien, pero /api/health no responde. Mira /var/log/nginx/error.log y el log de php$PHPV-fpm."
fi
cat <<E

Actualizar:  git -C $APP_DIR pull
Datos:       $DATA_DIR  (copia de seguridad: Ajustes → Exportar)
Seguridad:   la app no tiene login. Si el puerto $PORT es público, activa auth_basic
             en $CONF_LINK (bloque comentado) o limita el acceso con el firewall.
E
