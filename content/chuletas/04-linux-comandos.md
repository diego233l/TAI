# Linux: comandos y conceptos esenciales

## Permisos

- `r=4`, `w=2`, `x=1`; tres grupos: **u** (propietario), **g** (grupo), **o** (otros).
- `chmod 754 f` → `rwxr-xr--` · `chmod u+x f` · `chown usuario:grupo f` · `chgrp grupo f`.
- **umask 022** → ficheros **644**, directorios **755** (se resta de 666 / 777).
- **SUID (4)**, **SGID (2)**, **sticky bit (1)** (en `/tmp`: solo el propietario borra).
- En directorios: `x` = entrar, `r` = listar, `w` = crear/borrar entradas.

## Directorios (FHS)

`/etc` configuración · `/var` datos variables (`/var/log`) · `/home` usuarios · `/root` superusuario · `/bin`, `/sbin`, `/usr` binarios · `/dev` dispositivos · `/proc`, `/sys` virtuales · `/boot` núcleo · `/tmp` temporales · `/mnt`, `/media` montajes · `/opt` software de terceros.

## Ficheros y texto

`ls -l`, `cd`, `pwd`, `cp`, `mv`, `rm -r`, `mkdir -p`, `touch`, `ln -s` · `cat`, `less`, `head`, `tail -f`, `grep`, `wc`, `sort`, `uniq`, `cut`, `awk`, `sed`, `diff`, `find`, `locate`.

## Redirecciones

`>` sobrescribe · `>>` añade · `<` entrada · `2>` errores · `|` tubería · `tee` · `$?` = código de retorno (**0 = éxito**).

## Procesos y servicios

- `ps aux`, `top`, `htop`, `kill -15` (SIGTERM), `kill -9` (SIGKILL), `nice` (−20 a 19), `jobs`, `bg`, `fg`, `nohup`.
- systemd: `systemctl start|stop|restart|enable|disable|status`, `systemctl daemon-reload`, `journalctl -u servicio -f`, `journalctl -b`.
- Arranque: UEFI/BIOS → GRUB2 → núcleo + initramfs → systemd (PID 1) → targets (`rescue.target`, `multi-user.target`, `graphical.target`).
- cron: `minuto hora día-mes mes día-semana` · `*/5 * * * *` = cada 5 minutos.

## Discos

`lsblk`, `blkid`, `fdisk`/`parted`, `mkfs.ext4`, `mount`/`umount`, `/etc/fstab` (UUID), `fsck` (desmontado), `df -h` (espacio por sistema de ficheros), `du -sh` (por directorio), `free -h` (memoria), `smartctl`.

**LVM**: `pvcreate` → `vgcreate` → `lvcreate`; `lvextend -r` amplía el LV y el FS. XFS no se reduce; ext4 sí (desmontado).

## Usuarios

`useradd`, `usermod`, `userdel`, `passwd`, `chage`, `sudo` (`visudo`) · `/etc/passwd`, `/etc/shadow` (hashes), `/etc/group` · UID 0 = root.

## Red

`ip addr`, `ip route`, `ss -tulpn`, `ping`, `traceroute`, `dig`, `curl`, `ssh`, `scp`, `nmcli`, `hostnamectl`, `timedatectl` · `/etc/hosts`, `/etc/resolv.conf`.

## Seguridad

SSH: `PermitRootLogin no`, `PasswordAuthentication no`, clave pública · `fail2ban` · `ufw` / `firewalld` / `nftables` · SELinux (Red Hat) y AppArmor (Ubuntu, SUSE) · `auditd`.

## Paquetes

Debian/Ubuntu: `apt update && apt upgrade` (`.deb`, `dpkg`) · RHEL/Fedora: `dnf upgrade` (`.rpm`) · SUSE: `zypper` · Arch: `pacman`.

## Enlaces

- **Duro**: mismo inodo; no cruza sistemas de ficheros ni apunta a directorios.
- **Simbólico** (`ln -s`): fichero que contiene la ruta destino.
