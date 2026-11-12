# Security

Use the support contact provided by the official service at <https://fuyao.aicubes.cn/> to report vulnerabilities privately. Include the CLI version, error code and request identifier. Do not include API keys, credentials, private datasets, or production logs containing secrets.

Credentials belong to one operating-system user and must remain on a reliable local filesystem. They are stored in a private plaintext file protected by operating-system permissions. POSIX files remain private, and credential directories must not allow group or other write access. Current-user and root ownership are supported; root-created entries in a user-owned directory preserve that user's ownership. Windows accepts owners and ACLs limited to the user, SYSTEM and built-in Administrators, including safe inherited permissions. The operating system enforces the access required by each file operation. The system credential store is used only to import earlier credentials. Keep the user home and its ACL private.

OAuth uses a public client with PKCE and verifies OIDC identity when the service returns an ID Token. Lost or uncertain refresh results require a new login after the access token expires. Local logout is committed before remote revocation; a failed remote revocation is reported. Previously issued download URLs expire independently.

Never include access tokens, refresh tokens, ID tokens, authorization codes, PKCE verifiers or full authorization URLs in reports. Use the error code and request identifier.
