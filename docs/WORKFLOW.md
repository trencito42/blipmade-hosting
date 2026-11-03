# How work gets to production

There are three places and no others.

| Place | Where | Rule |
|---|---|---|
| **GitHub** | `trencito42/blipmade-hosting`, branch `main` | The truth. Production is always a commit of `main`. |
| **The working copy** | `/root/work` on the hypervisor (one checkout) | The only place where code is written. One branch per task: `work/<what>`. |
| **Production** | `/opt/blipmade` on the platform VM | A clean checkout of `main`. Nobody edits it, nobody commits in it, nobody merges in it. |

## A change, from start to production

1. In the working copy: `git switch -c work/<what> origin/main`, write, run the tests (the test bench on the VM, see below).
2. `git push origin work/<what>`, then merge into `main` fast-forward only (`git push origin work/<what>:main` after a rebase on `origin/main`). Delete the branch: `git push origin --delete work/<what>` and `git branch -d work/<what>`.
3. On the platform VM: `cd /opt/blipmade && bash scripts/deploy.sh`. It refuses to run if the folder is not clean, if main cannot be fast-forwarded, or if a service is being provisioned. It takes a backup, builds, migrates, replaces the containers, checks them and prints how to go back.

That is all. Nothing is copied into production by hand: no `tar`, no `git archive`, no editing in `/opt`.

## Rules that keep it clean

- **One working copy.** If two people or agents work at the same time, they do not share the checkout: the second one waits, or works on a temporary `git worktree add /root/work-<what>` that is removed (`git worktree remove`) the day the branch is merged. No worktree outlives its branch.
- **Branches live a few days.** A branch that is merged is deleted the same day. `main` and the branches of open work are the only ones.
- **Production does not run anything that is not in `main`.** If a fix is urgent, it goes through the same three steps; it is quick because the script is.
- **The deploy never uses an old base or a picked set of commits.** What is in `main` is what runs.
- **Test bench.** Tests run on the platform VM in a copy that is not a git repository (`~/testbed`), with the disposable database `support_test` (never `blipmade`). The copy is refreshed from the working copy with `rsync`; it is never committed from.

## When something goes wrong

Go back to the previous images (the script prints the command), then fix forward in the working copy. Never "fix" in `/opt/blipmade`: the next deploy refuses to run on a dirty folder, which is the point.
