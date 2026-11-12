# npm Publishing

Releases use the public repository's `hithink-finance-cli-release.yml` workflow and npm Trusted Publishing. Run local CLI commands from `hithink-finance-cli/`.

1. Confirm `package.json`, `npm-shrinkwrap.json`, the generated Skill manifest and CHANGELOG use the intended version. Keep the approved `LICENSE` in the package. The package's `repository.url` must match the public GitHub repository for provenance verification, including capitalization.
2. Run `npm run generate:contracts`, `npm run verify`, the monorepo's Python SDK tests and `python scripts/sync_skill_contracts.py --check` from the appropriate directories.
3. Confirm the target repository and maintainer permissions, check that the intended npm version is unused, and verify the workflow's npm Trusted Publisher configuration.
4. Run `npm pack --ignore-scripts`, install that tarball into an isolated prefix, then verify version, authentication status, bundled Skills, doctor and uninstall. Skills must be delivered from the installed package into shared local content and linked to selected Agent directories.
5. After publication authorization, push the validated public commit and its `v<version>` tag. The workflow validates tag/package parity, publishes with provenance, and creates the GitHub Release. Stable versions use `latest`; prereleases use `next`. Keep an unpublished candidate version while fixing failed checks. Replacing an already-pushed failed candidate tag requires explicit authorization and verification that neither its npm version nor GitHub Release was published. Tags backing published artifacts remain immutable. Recover a transient workflow failure using its existing tag, without repeating a completed npm publication.
6. Read back the published version and dist-tag from the official registry, then verify a fresh installation. Record the exact version, tarball integrity and validation results.

The publish job runs `npm run verify` and `node scripts/check-license.mjs` once before packing and publishing. It uses `npm publish --ignore-scripts` to avoid repeating the complete verification through `prepublishOnly`. Local manual publishing retains the `prepublishOnly` safeguard.

For WorkBuddy, generate the connector with `node scripts/package-workbuddy.mjs <new-output-directory> <approved-auth-domain> [connector-version]` after building. The optional connector version defaults to the CLI version; the minimum CLI version always comes from package.json. The required CLI version must already be published before submitting the connector. The generated auth command uses foreground completion with `authWaitForExit: true`; WorkBuddy opens the printed URL and waits for the result. Test installation, browser authorization, cancellation, status, logout, restart and expired credentials in the real host on supported platforms.

The connector icon is `assets/workbuddy/icon.png`, copied unchanged from the frontend project's `apps/docs/static/img/favicon.png`. Refresh this asset from the official frontend icon when branding changes.
