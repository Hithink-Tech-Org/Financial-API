export const remoteOutputOptions = [
  {
    flags: '--output <path>',
    description: 'write the response or data rows to a file',
    type: 'string' as const,
  },
  {
    flags: '--file-format <format>',
    description: 'output file format (requires --output)',
    type: 'string' as const,
    choices: ['json', 'ndjson', 'csv'],
    defaultValue: 'json',
  },
];

export const tableOutputOptions = [
  {
    flags: '--max-rows <count>',
    description: 'table preview rows; 0 shows all returned rows',
    defaultValue: 20,
  },
  { flags: '--columns <fields>', description: 'table fields, comma-separated; * shows all fields' },
];
