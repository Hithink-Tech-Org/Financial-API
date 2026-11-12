# npm Publishing

Releases use the public repository's `hithink-finance-cli-release.yml` workflow and npm Trusted Publishing. Run local CLI commands from `hithink-finance-cli/`.

1. Confirm `package.json`, `npm-shrinkwrap.json`, the generated Skill manifest and CHANGELOG use the intended version. Keep the approved `LICENSE` in the package.
2. Run `npm run generate:contracts`, `npm run verify`, the monorepo's Python SDK tests and `python scripts/sync_skill_contracts.py --check` from the appropriate directories.
3. Confirm the target repository and maintainer permissions, check that the intended npm version is unused, and verify the workflow's npm Trusted Publisher configuration.
4. Run `npm pack --ignore-scripts`, install that tarball into an isolated prefix, then verify version, authentication status, bundled Skills, doctor and uninstall. Skills must be delivered from the installed package into shared local content and linked to selected Agent directories.
5. After publication authorization, push the validated public commit and its immutable `v<version>` tag. The workflow validates tag/package parity, publishes with provenance, and creates the GitHub Release. Stable versions use `latest`; prereleases use `next`. Recover a failed release by dispatching the workflow for the same existing tag; do not move a published tag or repeat a completed npm publication.
6. Read back the published version and dist-tag from the official registry, then verify a fresh installation. Record the exact version, tarball integrity and validation results.

For WorkBuddy, generate the connector with `node scripts/package-workbuddy.mjs <new-output-directory> <approved-auth-domain>` after building. The CLI version must already be published before submitting the connector. Test installation, browser authorization, status, logout, restart and expired credentials in the real host on supported platforms.

The connector icon is `assets/workbuddy/icon.png`, copied unchanged from the frontend project's `apps/docs/static/img/favicon.png`. Refresh this asset from the official frontend icon when branding changes.
