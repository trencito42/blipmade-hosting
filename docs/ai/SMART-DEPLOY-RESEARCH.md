# Smart Deploy research (issue #18)

Status: research only. No importer, no build runner, and no change to provisioning.

## What exists

- A server is created from a `Product` egg through the panel. Customer variables are sealed on the order and written into the container environment.
- Git deployment already exists for an instance that is running: connect a repository, deploy, and roll back. That path updates an existing service. It does not inspect an unknown archive and choose an egg.
- ZIP upload of a bot or site into the control plane does not exist. The panel file API can write files into a server the customer already owns.

## What must be true before an importer

- The archive or Git revision is fetched by a worker with no panel credentials, size-capped, and never executed on the API host.
- Runtime detection may suggest a product slug from a manifest (`package.json`, `requirements.txt`, `go.mod`). The customer confirms the suggestion. The server refuses a slug that is not an existing visible product.
- Secrets in the archive stay sealed the same way customer variables are sealed. They are not written to logs, audits, or the catalogue preset.
- A database or Redis dependency is a separate product order, using the managed-service add-on link from issue #20. It is not started inside the application container by the importer.
- The existing Git deploy remains the update path after the first install.

## Not decided

- Where the inspection worker runs, and which archive formats are accepted.
- Whether a failed detection stops the order or falls back to a generic runtime product.

No production behaviour changes until those decisions and a disposable provisioning test exist.
