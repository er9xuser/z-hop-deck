# Security policy

## Supported versions

Only the latest release gets security fixes. Update with `docker compose pull && docker compose up -d`.

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Report them privately on GitHub: **Security → Report a vulnerability** in this repository
(<https://github.com/er9xuser/z-hop-deck/security/advisories/new>).

Include what you found, how to reproduce it and which version you use (top-right corner of the app). You will get an answer within a few days; a fix is released as a new version and credited to you in the changelog, unless you prefer otherwise.

## Scope

Z-Hop Deck is meant to run on a private network or behind a login portal. Reports are welcome for anything that lets someone without the password (or outside `TRUSTED_NETWORKS`) read, change or delete data, run code on the server, or reach files outside the library folder.

Running the app on the open internet without `APP_PASSWORD` or a login portal is not a supported setup.
