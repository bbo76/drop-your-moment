#!/bin/sh
set -eu

SECRET_DIR=/etc/dropyourmoment
SECRET_FILE=$SECRET_DIR/hotspot.secret
CONNECTION=dym-hotspot
SSID=DYM-PhotoBooth
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

if [ "$(id -u)" -ne 0 ]; then
  echo "Lancez ce script avec sudo." >&2
  exit 1
fi

apt-get install -y network-manager nftables openssl
install -d -m 750 -o root -g photobooth "$SECRET_DIR"
if [ ! -s "$SECRET_FILE" ]; then
  openssl rand -base64 18 | tr -d '/+=' | cut -c1-20 > "$SECRET_FILE"
fi
chown root:photobooth "$SECRET_FILE"
chmod 640 "$SECRET_FILE"
SECRET=$(tr -d '\n' < "$SECRET_FILE")

nmcli connection delete "$CONNECTION" >/dev/null 2>&1 || true
nmcli connection add type wifi ifname wlan0 con-name "$CONNECTION" ssid "$SSID"
nmcli connection modify "$CONNECTION" \
  connection.autoconnect no \
  802-11-wireless.mode ap \
  802-11-wireless.band bg \
  802-11-wireless.ap-isolation 1 \
  wifi-sec.key-mgmt wpa-psk \
  wifi-sec.psk "$SECRET" \
  ipv4.method shared \
  ipv4.addresses 10.42.0.1/24 \
  ipv6.method disabled

install -d -m 755 /etc/nftables.d
install -m 644 "$SCRIPT_DIR/dropyourmoment-hotspot.nft" /etc/nftables.d/dropyourmoment-hotspot.nft
install -m 644 "$SCRIPT_DIR/dropyourmoment-hotspot-firewall.service" /etc/systemd/system/dropyourmoment-hotspot-firewall.service
install -m 440 "$SCRIPT_DIR/dropyourmoment-sudoers" /etc/sudoers.d/dropyourmoment
install -d -m 755 /etc/polkit-1/rules.d
install -m 644 "$SCRIPT_DIR/49-dropyourmoment-network.rules" /etc/polkit-1/rules.d/49-dropyourmoment-network.rules
systemctl daemon-reload
systemctl enable --now NetworkManager nftables dropyourmoment-hotspot-firewall.service

echo "Hotspot installé. Secret : $SECRET_FILE"
