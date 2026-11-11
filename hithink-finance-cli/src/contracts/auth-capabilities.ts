export const authCapabilities = [
  {
    id: 'auth.login',
    command: ['auth', 'login'],
    description: 'Validate, save and activate a global credential',
    options: [
      { flags: '--method <method>', choices: ['oauth', 'api-key'] },
      { flags: '--api-key-stdin' },
      { flags: '--background' },
      { flags: '--no-browser' },
      { flags: '--replace' },
    ],
  },
  {
    id: 'auth.status',
    command: ['auth', 'status'],
    description:
      'Read local connection state without network or writes; exit 0 when connected, 3 otherwise',
    options: [],
  },
  {
    id: 'auth.use',
    command: ['auth', 'use'],
    description: 'Activate a saved credential',
    arguments: [{ name: 'method', required: true, choices: ['oauth', 'api-key'] }],
    options: [],
  },
  {
    id: 'auth.logout',
    command: ['auth', 'logout'],
    description: 'End the active session locally, then attempt remote revocation',
    options: [{ flags: '--all' }],
  },
  {
    id: 'auth.migrate',
    command: ['auth', 'migrate'],
    description: 'Import previous credentials into the shared file',
    options: [{ flags: '--legacy-profile <name>' }],
  },
] as const;
