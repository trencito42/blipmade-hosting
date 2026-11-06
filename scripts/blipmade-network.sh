#!/bin/bash
set -euo pipefail

# IP-uri publice suplimentare
# .119 VPS-uri NAT, .120 VPS dedicat (primul client), .160 rezervat pentru mailul clientilor.
for IP in 193.34.214.86 193.34.214.87 193.34.214.143 193.34.214.119 193.34.214.120 193.34.214.160; do
    ip -4 addr show dev eth0 | grep -Fq "$IP/32" || \
        ip -4 addr add "$IP/32" dev eth0
done

# IPv4 forwarding
sysctl -w net.ipv4.ip_forward=1 >/dev/null

# NAT pentru iesirea VM-urilor la internet
iptables -t nat -C POSTROUTING \
    -s 10.77.0.0/24 -o eth0 -j MASQUERADE 2>/dev/null || \
iptables -t nat -A POSTROUTING \
    -s 10.77.0.0/24 -o eth0 -j MASQUERADE

# DNAT idempotent
forward_port() {
    local public_ip="$1"
    local port="$2"
    local private_ip="$3"

    iptables -t nat -C PREROUTING \
        -d "$public_ip" -p tcp --dport "$port" \
        -j DNAT --to-destination "$private_ip:$port" 2>/dev/null || \
    iptables -t nat -A PREROUTING \
        -d "$public_ip" -p tcp --dport "$port" \
        -j DNAT --to-destination "$private_ip:$port"
}

# Panel: VM 100
forward_port 193.34.214.86 80 10.77.0.10
forward_port 193.34.214.86 443 10.77.0.10

# Wings: VM 101
forward_port 193.34.214.87 80 10.77.0.11
forward_port 193.34.214.87 8080 10.77.0.11
forward_port 193.34.214.87 2022 10.77.0.11

forward_port 193.34.214.87 30001 10.77.0.11
forward_port 193.34.214.143 80 10.77.0.12
forward_port 193.34.214.143 443 10.77.0.12

# Mailcow: VM 104
# SMTP (25), SMTPS (465), submission (587), IMAPS (993), autodiscover (4190),
# webmail and the mail configuration over HTTPS (80 and 443).
forward_port 193.34.214.20 25 10.77.0.14
forward_port 193.34.214.20 465 10.77.0.14
forward_port 193.34.214.20 587 10.77.0.14
forward_port 193.34.214.20 993 10.77.0.14
forward_port 193.34.214.20 4190 10.77.0.14
forward_port 193.34.214.20 80 10.77.0.14
forward_port 193.34.214.20 443 10.77.0.14

# --- Reteaua VPS-urilor clientilor: vmbr2, 10.78.0.0/24 ---
# Separata de vmbr1 (reteaua platformei): un VPS nu vede panoul, baza de date,
# nodul Wings, mailul si nici gazda. Iesirea la internet se face cu IP-ul .119,
# nu cu .20, ca reputatia mailului platformei sa nu depinda de un client.
if ! ip link show vmbr2 >/dev/null 2>&1; then
    ip link add vmbr2 type bridge
fi
ip -4 addr show dev vmbr2 | grep -Fq "10.78.0.1/24" || ip addr add 10.78.0.1/24 dev vmbr2
ip link set vmbr2 up

ensure_rule() {
    local table="$1" action="$2"
    shift 2
    iptables -t "$table" -C "$@" 2>/dev/null || iptables -t "$table" "$action" "$@"
}

# O regula inserata in fata lantului. Verificarea nu poarta pozitia, ca sa nu se dubleze.
ensure_front() {
    local chain="$1"
    shift
    iptables -C "$chain" "$@" 2>/dev/null || iptables -I "$chain" 1 "$@"
}

ensure_rule nat -A POSTROUTING -s 10.78.0.0/24 -o eth0 -j SNAT --to-source 193.34.214.119

# FORWARD, de jos in sus: SMTP afara blocat, apoi VPS -> platforma blocat,
# apoi raspunsurile la conexiunile deschise din platforma permise.
ensure_front FORWARD -i vmbr2 -p tcp --dport 25 -j REJECT --reject-with tcp-reset
ensure_front FORWARD -i vmbr2 -d 10.77.0.0/24 -j DROP
ensure_front FORWARD -i vmbr2 -d 10.77.0.0/24 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
# Un VPS nu ajunge la serviciile gazdei (Proxmox 8006 etc.).
ensure_front INPUT -i vmbr2 -j DROP
ensure_front INPUT -i vmbr2 -p icmp -j ACCEPT
ensure_front INPUT -i vmbr2 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

# NAT-ul VPS-urilor il tine blipmade-vps-sync.service, dupa etichetele VM-urilor.

# Tenant isolation on vmbr2: TAP ports cannot see each other. They still
# reach the gateway on the bridge (NAT / DHCP / SSH DNAT).
if command -v bridge >/dev/null 2>&1 && [ -d /sys/class/net/vmbr2/brif ]; then
  for port in /sys/class/net/vmbr2/brif/*; do
    [ -e "$port" ] || continue
    name="$(basename "$port")"
    [ "$name" = "vmbr2" ] && continue
    bridge link set dev "$name" isolated on 2>/dev/null || true
  done
fi

echo "Blipmade network configuration applied."
