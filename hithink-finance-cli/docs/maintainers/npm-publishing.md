# npm Publishing

Run commands from `hithink-finance-cli/`. Publish the existing public npm package with an authorized maintainer account and interactive 2FA.

1. Confirm `package.json`, `npm-shrinkwrap.json`, the generated Skill manifest and CHANGELOG use the intended version. Keep the approved `LICENSE` in the package.
2. Run `npm run generate:contracts`, `npm run verify`, the monorepo's Python SDK tests and `python scripts/sync_skill_contracts.py --check` from the appropriate directories.
3. Check the account with `npm whoami --registry=https://registry.npmjs.org` and its package access with `npm access list packages --registry=https://registry.npmjs.org --json`. The package must have `read-write` access. Check the intended version is unused.
4. Run `npm pack --ignore-scripts`, install that tarball into an isolated prefix, then verify version, authentication status, bundled Skills, doctor and uninstall. Skills must be delivered from the installed package into shared local content and linked to selected Agent directories.
5. After explicit publication authorization, run `npm publish --access public --tag latest --registry=https://registry.npmjs.org` and complete the interactive 2FA challenge. Use `next` for prereleases. This manual path does not request CI provenance.
6. Read back the published version and dist-tag from the official registry, then verify a fresh installation. Record the exact version, tarball integrity and validation results.

For WorkBuddy, generate the connector with `node scripts/package-workbuddy.mjs <new-output-directory> <approved-auth-domain>` after building. The CLI version must already be published before submitting the connector. Test installation, browser authorization, status, logout, restart and expired credentials in the real host on supported platforms.

The connector icon is `assets/workbuddy/icon.png`, copied unchanged from the frontend project's `apps/docs/static/img/favicon.png`. Refresh this asset from the official frontend icon when branding changes.
