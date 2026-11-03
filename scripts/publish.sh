#!/usr/bin/env bash
# Publishes the work of the working copy to main on GitHub, fast-forward only.
#
#   cd /root/work && git switch -c work/<what> && ...commit... && bash scripts/publish.sh
#
# The hypervisor cannot reach GitHub; the platform VM can. The relay is a clone on the VM (~/relay): the working copy pushes
# to it, and the relay pushes to GitHub. Nothing is merged by hand and nothing is copied into production from here.
set -euo pipefail
VM=debian@10.77.0.13
KEY=/root/.ssh/blipmade_vm103
export GIT_SSH_COMMAND="ssh -i $KEY"
cd "$(git rev-parse --show-toplevel)"

[ -z "$(git status --porcelain)" ] || { echo "REFUSED: there are changes that are not committed."; git status --short | sed -n '1,10p'; exit 1; }
ssh -i "$KEY" "$VM" 'cd ~/relay && git fetch -q origin'
git fetch -q relay
git merge-base --is-ancestor github/main HEAD || { echo "REFUSED: your work is not on top of main. Run: git rebase github/main"; exit 1; }

git push -q -f relay HEAD:refs/heads/incoming
ssh -i "$KEY" "$VM" 'cd ~/relay && git push origin incoming:main'
git fetch -q relay
echo "Published $(git rev-parse --short HEAD) to main. Deploy with: ssh $VM 'cd /opt/blipmade && bash scripts/deploy.sh'"
