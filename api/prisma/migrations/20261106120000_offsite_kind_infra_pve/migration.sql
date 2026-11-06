-- Infra vzdump and Proxmox config copies the existing off-site agent already uploads.
ALTER TYPE "OffsiteKind" ADD VALUE 'INFRA';
ALTER TYPE "OffsiteKind" ADD VALUE 'PVE';
