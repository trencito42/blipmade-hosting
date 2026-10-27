# The recovery package of the platform

This is the handoff of the encrypted recovery copy of Blipmade. It says what
the copy is, how it is made, how it is taken, how it is checked and how the
platform is put back on a new machine.

Nothing in this document is a secret. The secrets are in the package, and the
package is encrypted for a key that the operator holds.

## What the copy is

`scripts/recovery-package.sh` builds a package with everything that is needed
to rebuild the platform on another machine:

| Part | What is in it |
|---|---|
| `env/.env` | the environment of the platform: the secret of the session, the keys of Stripe, the key of the panel, the key of the mail system, the token of Caddy, the addresses of the database, the SMTP and the off-site copy |
| `env/.env.db-admin` | the connection of the owner of the database |
| `env/.env.test` | the connection of the role of the tests |
| `keys/blipmade-backup.age` | the identity that decrypts the off-site copies of the backup |
| `keys/blipmade_offsite` | the key that writes the off-site copy |
| `keys/github_deploy` | the key that pushes to the repository |
| `keys/ssh-config`, `keys/known_hosts` | the addresses and the fingerprints of the machines |
| `app/schema.prisma`, `app/migrations` | the shape of the database |
| `app/scripts` | the tools of the backup, of the restore and of the off-site copy |
| `app/compose*.yml`, `app/workflows` | the way the platform is started and checked |

The copy is encrypted with `age`, for the public key of the operator. The
private key of the operator is **not** on the server, so the server cannot
open the copy on its own. The script refuses to build the package for the
key that is on the machine, for exactly that reason.

## How the key of the operator is made

On the MacBook of the operator:

```bash
brew install age
age-keygen -o ~/blipmade-recovery-key.txt
# the file holds the public key and the private key
age-keygen -y ~/blipmade-recovery-key.txt
```

The line that `age-keygen -y` prints is the public key (it begins with
`age1`). That line is what the server needs; the private key stays on the
MacBook.

## How the package is built

On the platform host, as the user that owns the platform:

```bash
cd /opt/blipmade
./scripts/recovery-package.sh --recipient age1... --label recovery
```

The script prints the path of the package, the path of the receipt and the
path of the checksum. It prints nothing else: no secret of the platform ever
reaches a log.

The package is written in `~/recovery/`, with the mode `600`.

## How the package is taken

From the MacBook of the operator:

```bash
mkdir -p ~/blipmade-recovery && cd ~/blipmade-recovery
scp debian@10.77.0.13:/home/debian/recovery/blipmade-recovery-<stamp>.tar.gz.age .
scp debian@10.77.0.13:/home/debian/recovery/blipmade-recovery-<stamp>.tar.gz.age.sha256 .
scp debian@10.77.0.13:/home/debian/recovery/MANIFEST-<stamp>.txt .
```

`sftp` works as well:

```bash
sftp debian@10.77.0.13 <<'SFTP'
get /home/debian/recovery/blipmade-recovery-<stamp>.tar.gz.age
get /home/debian/recovery/blipmade-recovery-<stamp>.tar.gz.age.sha256
get /home/debian/recovery/MANIFEST-<stamp>.txt
SFTP
```

## How the copy is checked

The checksum is of the encrypted package, so it is checked before the package
is opened:

```bash
shasum -a 256 -c blipmade-recovery-<stamp>.tar.gz.age.sha256
```

The answer has to be `blipmade-recovery-<stamp>.tar.gz.age: OK`. A package
that was damaged on the way says `FAILED`; it is then taken again and the
checksum is compared with the one on the server.

The package is then opened and read:

```bash
age -d -i ~/blipmade-recovery-key.txt blipmade-recovery-<stamp>.tar.gz.age > recovered.tar.gz
tar tzf recovered.tar.gz          # the list of what is inside
tar xzf recovered.tar.gz -C ~/blipmade-recovery
```

The receipt (`MANIFEST-<stamp>.txt`) holds the same list, in the clear, so the
operator can read what he is getting before he takes the package.

## How the platform is put back

1. A new host with the same addresses is prepared, and the packages of the
   platform are installed (Docker, Node.js 22, PostgreSQL 16, Redis).
2. The repository is cloned and the state of the commit that is written in the
   receipt is checked out.
3. The environment is put back from `env/.env` (and the other two files), with
   the mode `600`.
4. The directory of the secrets of the platform is made with the mode `700` and
   it belongs to the owner of the machine: `mkdir -p /opt/blipmade/secrets &&
   chmod 700 /opt/blipmade/secrets`. The file of the Discord channel is
   mounted in the containers from it, and it must not be readable by the other
   users of the machine.
5. The database is created and the roles are made with `scripts/db-roles.sh`;
   the migrations are applied with `scripts/apply-migrations.sh` as the owner.
6. The identity of the age is put back in `/home/debian/.blipmade-backup.age`
   (the mode `600`), so the off-site copies can be read again.
7. The off-site copy is restored with `scripts/restore-offsite-drill.sh`, and
   the database of the platform is restored from it.
8. The containers are started and the smoke test is run:
   `docker compose -f compose.yml -f compose.api.yml -f compose.web.yml up -d --build && ./scripts/smoke-production.sh`.

## What was not done, on purpose

- Nothing was deleted and nothing was rotated. The copy is taken **before**
  anything changes, and the old secrets keep working until the operator says
  that the copy is in his hands.
- The copy was not sent by mail, by HTTP or by a public link. It travels over
  SSH, in a file that only the operator can open.

## The off-site copy has to move

The off-site copy of the backup of the platform is written to the machine of
the mail (`blipmade-offsite` resolves to `10.77.0.14`). That machine stands in
the same cluster as the platform: if the cluster is lost, the platform and its
off-site copy are lost together.

A real off-site copy belongs to a provider that is not in this cluster: a
bucket of an object store, or a second server of another operator. The
configuration of the copy is in the environment of the platform
(`OFFSITE_TARGET`, `OFFSITE_TRANSPORT`), and the change is a new target and
a new key. Once it is in place, `scripts/restore-offsite-drill.sh` restores a
copy without touching the live database, and the drill says in the receipt
whether the copy was whole.
