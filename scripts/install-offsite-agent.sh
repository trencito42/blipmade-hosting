#!/usr/bin/env bash
# Installs the offsite agent and its timers on THIS machine. Run as root, on the node and on the hypervisor.
#   node:        ./install-offsite-agent.sh node
#   hypervisor:  ./install-offsite-agent.sh hypervisor
#   platform:    ./install-offsite-agent.sh platform   (the VM that runs the API)
# It does not write any secret: /etc/blipmade/offsite.env and the ssh key are put there by the operator.
set -euo pipefail
role="${1:?node or hypervisor}"
[ "$(id -u)" = 0 ] || { echo "run as root" >&2; exit 1; }
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
install -d -m 700 /etc/blipmade /var/lib/blipmade-offsite
install -m 755 "$here/offsite-agent.sh" /usr/local/sbin/blipmade-offsite-agent
[ -e /etc/blipmade/offsite.env ] || install -m 600 "$here/offsite.env.example" /etc/blipmade/offsite.env
unit() { # unit <name> <mode> <calendar>
  cat > "/etc/systemd/system/blipmade-offsite-$1.service" <<EOF
[Unit]
Description=Blipmade offsite backup: $2
After=network-online.target
Wants=network-online.target
[Service]
Type=oneshot
Nice=10
IOSchedulingClass=idle
ExecStart=/usr/local/sbin/blipmade-offsite-agent $2
EOF
  cat > "/etc/systemd/system/blipmade-offsite-$1.timer" <<EOF
[Unit]
Description=Blipmade offsite backup timer: $2
[Timer]
OnCalendar=$3
RandomizedDelaySec=300
Persistent=true
[Install]
WantedBy=timers.target
EOF
  systemctl enable --now "blipmade-offsite-$1.timer" >/dev/null
}
if [ "$role" = node ]; then
  unit customers customers '*-*-* 04:30:00'   # after the 03:30 schedules of the panel have finished
  unit databases databases '*-*-* 05:10:00'
  unit retention retention '*-*-* 06:00:00'
elif [ "$role" = platform ]; then
  unit platform platform '*-*-* 02:50:00'     # after the backup of the platform (about 02:16 to 02:25)
  unit retention retention '*-*-* 06:40:00'
elif [ "$role" = hypervisor ]; then
  unit vps vps 'Sun *-*-* 02:00:00'
  unit infra infra 'Sun *-*-* 03:30:00'
  unit pve pve '*-*-* 01:40:00'
  unit retention retention '*-*-* 06:30:00'
fi
unit destination destination '*-*-* *:05:00'    # hourly: the reachability and the room left, for the admin page
echo "installed. Fill /etc/blipmade/offsite.env, place the key, then: systemctl start blipmade-offsite-destination.service"
