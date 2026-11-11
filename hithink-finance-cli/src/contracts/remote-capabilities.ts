import { z, type ZodType } from 'zod';
import {
  newsArticleOutput,
  newsFlashOutput,
  newsNoticeOutput,
  newsTopicOutput,
  newsAnomalyOutput,
  newsTimelineOutput,
} from './news-output.js';

export interface RemoteOptionDescriptor {
  flags: string;
  description: string;
  type: 'string' | 'integer' | 'number' | 'boolean';
  required?: boolean;
  choices?: readonly string[];
  defaultValue?: string | number | boolean;
  queryName?: string;
}

export interface RemoteCapabilityDescriptor {
  id: string;
  command: readonly [string, string];
  description: string;
  endpoint: string;
  method: 'GET';
  inputSchema: ZodType<Record<string, unknown>>;
  outputSchema: ZodType<unknown>;
  options: readonly RemoteOptionDescriptor[];
  paging: 'none' | 'offset' | 'page' | 'json';
  pagingEnd?: 'short-page' | 'has-more';
  window: 'none' | 'ten-years' | 'five-years' | 'one-year' | 'today-only';
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const calendarDate = isoDate.refine((value) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'expected a valid calendar date');
const nonblank = z.string().refine((value) => value.trim().length > 0, 'expected non-empty text');
const newsSegment = nonblank.refine((value) => !/[\\/]/u.test(value), 'expected one path segment');
const newsSeq = z
  .string()
  .refine(
    (value) => /^[0-9]+$/u.test(value) && BigInt(value) <= 9223372036854775807n,
    'expected a decimal string within signed 64-bit range',
  );
const businessCodes = z.string().superRefine((value, context) => {
  const tokens = value.split(',');
  if (tokens.length > 50 || tokens.some((token) => !/^\d{6}\.(SH|SZ|BJ)$/iu.test(token.trim())))
    context.addIssue({ code: 'custom', message: 'expected 1 to 50 A-share code tokens' });
});
const opportunityTypes = z
  .string()
  .refine(
    (value) => value.split(',').every((token) => /^687(1[0-9]|2[0-7])$/u.test(token.trim())),
    'expected opportunity types 68710 through 68727',
  );
const departmentId = z
  .string()
  .min(1)
  .max(128)
  .refine((value) => value.trim().length > 0);
const aShareCode = z.string().regex(/^\d{6}\.(SH|SZ|BJ)$/iu);
const indexCode = z.string().regex(/^\d{6}\.(SH|SZ|BJ|TI)$/iu);
const commaCodes = z.string().min(1);
const assetTypes = [
  'a-share',
  'a-share-index',
  'forex',
  'fund-otc',
  'fund-etf',
  'fund-lof',
  'fund-reits',
  'futures',
  'options',
] as const;
const assetTypeCsv = z.string().superRefine((value, context) => {
  const tokens = value.split(',');
  if (
    tokens.length === 0 ||
    tokens.some(
      (token) => token.length === 0 || !assetTypes.includes(token as (typeof assetTypes)[number]),
    )
  ) {
    context.addIssue({ code: 'custom', message: 'invalid comma-separated asset type' });
  }
});
const fundCode = z.string().regex(/^\d{6}\.(OF|SH|SZ)$/iu);
const securityCode = z.string().regex(/^\d{6}\.(OF|SH|SZ|BJ)$/iu);
const derivativeCode = z.string().trim().min(1);
const derivativeVariety = z.string().regex(/^[A-Z][A-Z0-9]*$/u);
const derivativeList = z.string().superRefine((value, context) => {
  const tokens = value.split(',').map((token) => token.trim());
  if (tokens.length < 1 || tokens.length > 5 || tokens.some((token) => token.length === 0))
    context.addIssue({ code: 'custom', message: 'list must contain 1 to 5 non-empty values' });
});
const record = z.record(z.string(), z.unknown());
const resultRecord = z.object({ thscode: z.string().nullable().optional() }).passthrough();
const itemOutput = z.object({ item: z.array(resultRecord) }).passthrough();
const objectOutput = z.object({}).passthrough();
const businessPageOutput = z
  .object({
    item: z.array(
      z.object({ thscode: z.string().nullable(), name: z.string().nullable() }).passthrough(),
    ),
    pagination: z
      .object({
        page: z.number().int(),
        size: z.number().int(),
        total: z.number().int().nullable(),
        has_next: z.boolean(),
      })
      .passthrough(),
  })
  .passthrough();
const arrayOutput = z.array(z.unknown());

function jsonString<T>(schema: z.ZodType<T>, field: string): z.ZodString {
  return z.string().superRefine((value, context) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      context.addIssue({ code: 'custom', message: `${field} must be valid JSON` });
      return;
    }
    const result = schema.safeParse(parsed);
    if (!result.success) {
      for (const issue of result.error.issues) {
        context.addIssue({
          code: 'custom',
          message: `${field}.${issue.path.join('.')}: ${issue.message}`,
        });
      }
    }
  });
}

const conditionJson = jsonString(z.union([record, z.array(z.unknown())]), 'condition');
const lineIndexesJson = jsonString(
  z.array(
    z
      .object({
        thscodes: z.array(securityCode),
        index_info: z.array(
          z
            .object({ index_id: z.string().min(1), attribute: z.unknown().optional() })
            .passthrough(),
        ),
      })
      .passthrough(),
  ),
  'indexes',
);
const timeRangeJson = jsonString(
  z
    .object({
      time_type: z.string().min(1),
      start: z.number().int().safe().optional(),
      end: z.number().int().safe().optional(),
      offset: z.number().int().safe().optional(),
    })
    .passthrough()
    .refine(
      (value) => value.start === undefined || value.end === undefined || value.end >= value.start,
      {
        message: 'end must be >= start',
      },
    ),
  'time_range',
);
const tableSelectorsJson = jsonString(
  z
    .object({
      include: z.array(z.object({ type: z.string().min(1) }).passthrough()).optional(),
    })
    .passthrough()
    .superRefine((value, context) => {
      for (const selector of value.include ?? []) {
        const candidate = selector as Record<string, unknown>;
        const securities = selector.type === 'stock_code' || selector.type === 'fund_code';
        const values = securities ? candidate.thscodes : candidate.values;
        if (
          !Array.isArray(values) ||
          values.some(
            (item) =>
              typeof item !== 'string' || (securities && !securityCode.safeParse(item).success),
          ) ||
          (securities && candidate.values !== undefined)
        ) {
          context.addIssue({ code: 'custom', message: 'invalid code selector' });
        }
      }
    }),
  'code_selectors',
);
const tableIndexesJson = jsonString(
  z.array(
    z
      .object({
        index_id: z.string().min(1),
        timestamp: z.number().int().safe().optional(),
        attribute: z.unknown().optional(),
      })
      .passthrough(),
  ),
  'indexes',
);
const pageInfoJson = jsonString(
  z
    .object({
      page_begin: z.number().int().safe().optional(),
      page_size: z.number().int().safe().optional(),
      code_begin: z.number().int().safe().optional(),
      code_page_size: z.number().int().safe().optional(),
    })
    .passthrough(),
  'page_info',
);
const sortJson = jsonString(
  z.array(z.object({ idx: z.number().int().safe(), type: z.string().min(1) }).passthrough()),
  'sort',
);
const quotaTabsJson = jsonString(z.array(z.string().trim().min(1)), 'tab');

const valuationCodes = z
  .string()
  .superRefine((value, context) => {
    const tokens = value.split(',');
    if (tokens.length > 100) {
      context.addIssue({ code: 'custom', message: 'thscodes accepts at most 100 raw tokens' });
    }
    if (
      tokens.length === 0 ||
      tokens.some(
        (token) => token.trim().length === 0 || !aShareCode.safeParse(token.trim()).success,
      )
    ) {
      context.addIssue({
        code: 'custom',
        message: 'thscodes must be comma-separated A-share codes',
      });
    }
  })
  .transform((value) => {
    const seen = new Set<string>();
    return value
      .split(',')
      .map((token) => token.trim().toUpperCase())
      .filter((token) => {
        if (seen.has(token)) return false;
        seen.add(token);
        return true;
      })
      .join(',');
  });

const historyInput = z
  .object({
    thscode: aShareCode,
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().nonnegative(),
    adjust: z.enum(['none', 'forward', 'backward']).default('forward'),
  })
  .strict()
  .refine((value) => value.endMs >= value.startMs, { message: 'end-ms must be >= start-ms' });

const indexHistoryInput = z
  .object({
    thscode: indexCode,
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().nonnegative(),
  })
  .strict()
  .refine((value) => value.endMs >= value.startMs, { message: 'end-ms must be >= start-ms' })
  .refine((value) => value.startMs >= recentIndexLowerBound(), {
    message: 'index history is available for the recent five calendar years',
  });

const fundHistoryInput = z
  .object({
    thscode: fundCode,
    interval: z.literal('1d').default('1d'),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.endMs < value.startMs) {
      context.addIssue({ code: 'custom', message: 'end-ms must be >= start-ms' });
      return;
    }
    const latest = new Date(value.startMs);
    latest.setUTCFullYear(latest.getUTCFullYear() + 5);
    if (value.endMs > latest.getTime()) {
      context.addIssue({
        code: 'custom',
        message: 'fund history window must not exceed five years',
      });
    }
  });

const financialInput = z
  .object({
    thscode: aShareCode,
    period: z.enum(['annual', 'quarterly']).default('annual'),
    limit: z.number().int().min(1).max(20).optional(),
    startMs: z.number().int().nonnegative().optional(),
    endMs: z.number().int().nonnegative().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const hasStart = value.startMs !== undefined;
    const hasEnd = value.endMs !== undefined;
    if (hasStart !== hasEnd) {
      context.addIssue({
        code: 'custom',
        message: 'start-ms and end-ms must be provided together',
      });
    }
    if ((hasStart || hasEnd) && value.limit !== undefined) {
      context.addIssue({ code: 'custom', message: 'limit and date range are mutually exclusive' });
    }
    if (hasStart && hasEnd && value.endMs! < value.startMs!) {
      context.addIssue({ code: 'custom', message: 'end-ms must be >= start-ms' });
    }
  });

const financialOptions: readonly RemoteOptionDescriptor[] = [
  {
    flags: '--thscode <code>',
    description: 'single A-share thscode',
    type: 'string',
    required: true,
  },
  {
    flags: '--period <period>',
    description: 'financial period',
    type: 'string',
    choices: ['annual', 'quarterly'],
    defaultValue: 'annual',
  },
  { flags: '--limit <number>', description: 'recent report count (1-20)', type: 'integer' },
  {
    flags: '--start-ms <milliseconds>',
    description: 'range start in milliseconds',
    type: 'integer',
    queryName: 'start',
  },
  {
    flags: '--end-ms <milliseconds>',
    description: 'range end in milliseconds',
    type: 'integer',
    queryName: 'end',
  },
];

function financial(
  id: string,
  command: 'income' | 'balance-sheet' | 'cash-flow',
  endpoint: string,
): RemoteCapabilityDescriptor {
  return {
    id,
    command: ['financials', command],
    description: `Query ${command} financial statements`,
    endpoint,
    method: 'GET',
    inputSchema: financialInput,
    outputSchema: itemOutput,
    options: financialOptions,
    paging: 'none',
    window: 'ten-years',
  };
}

function fundDetail(
  command:
    | 'profile'
    | 'holdings'
    | 'returns'
    | 'holders'
    | 'industry-allocation'
    | 'drawdowns'
    | 'dividends'
    | 'diagnostics'
    | 'financial-indicators'
    | 'income-statements'
    | 'balance-sheets'
    | 'asset-allocation',
  description: string,
  endpoint: string,
): RemoteCapabilityDescriptor {
  return {
    id: `fund.${command}`,
    command: ['fund', command],
    description,
    endpoint,
    method: 'GET',
    inputSchema: z.object({ thscode: fundCode }).strict(),
    outputSchema: itemOutput,
    options: [
      {
        flags: '--thscode <code>',
        description: 'single fund thscode',
        type: 'string',
        required: true,
      },
    ],
    paging: 'none',
    window: 'none',
  };
}

function fundManager(
  command: 'manager-style' | 'manager-performance' | 'manager-experience' | 'manager-detail',
  description: string,
  endpoint: string,
): RemoteCapabilityDescriptor {
  const needsRange = command === 'manager-performance';
  const ranges = ['month', 'tmonth', 'year', 'nowyear', 'now'] as const;
  return {
    id: `fund.${command}`,
    command: ['fund', command],
    description,
    endpoint,
    method: 'GET',
    inputSchema: needsRange
      ? z.object({ managerId: z.string().min(1), range: z.enum(ranges) }).strict()
      : z.object({ managerId: z.string().min(1) }).strict(),
    outputSchema: itemOutput,
    options: [
      {
        flags: '--manager-id <id>',
        description: 'fund manager identifier',
        type: 'string',
        required: true,
        queryName: 'manager_id',
      },
      ...(needsRange
        ? [
            {
              flags: '--range <range>',
              description: 'performance range',
              type: 'string' as const,
              required: true,
              choices: ranges,
            },
          ]
        : []),
    ],
    paging: 'none',
    window: 'none',
  };
}

function fundPortfolioHistory(
  command: 'stock-history' | 'bond-history',
  description: string,
  endpoint: string,
): RemoteCapabilityDescriptor {
  return {
    id: `fund.${command}`,
    command: ['fund', command],
    description,
    endpoint,
    method: 'GET',
    inputSchema: z
      .object({
        thscode: fundCode,
        reportType: z.string().min(1),
        endDate: z.string().min(1),
      })
      .strict(),
    outputSchema: itemOutput,
    options: [
      {
        flags: '--thscode <code>',
        description: 'single fund thscode',
        type: 'string',
        required: true,
      },
      {
        flags: '--report-type <type>',
        description: 'report type returned by the report-dates capability',
        type: 'string',
        required: true,
        queryName: 'report_type',
      },
      {
        flags: '--end-date <date>',
        description: 'report end date returned by the report-dates capability',
        type: 'string',
        required: true,
        queryName: 'end_date',
      },
    ],
    paging: 'none',
    window: 'none',
  };
}

function fundReportDates(
  command: 'stock-report-dates' | 'bond-report-dates',
  description: string,
  endpoint: string,
): RemoteCapabilityDescriptor {
  return {
    id: `fund.${command}`,
    command: ['fund', command],
    description,
    endpoint,
    method: 'GET',
    inputSchema: z
      .object({
        thscode: fundCode,
        reportType: z.string().min(1).optional(),
      })
      .strict(),
    outputSchema: itemOutput,
    options: [
      {
        flags: '--thscode <code>',
        description: 'single fund thscode',
        type: 'string',
        required: true,
      },
      {
        flags: '--report-type <type>',
        description: 'optional report type filter',
        type: 'string',
        queryName: 'report_type',
      },
    ],
    paging: 'none',
    window: 'none',
  };
}

function specialPool(
  command: 'limit-down-pool' | 'limit-break-pool',
  description: string,
  endpoint: string,
): RemoteCapabilityDescriptor {
  const sortFields =
    command === 'limit-down-pool'
      ? ([
          'last_limit_time',
          'first_limit_time',
          'last_price',
          'price_change_ratio_pct',
          'turnover_ratio_pct',
        ] as const)
      : ([
          'price_change_ratio_pct',
          'open_times',
          'last_price',
          'turnover_ratio_pct',
          'turnover',
        ] as const);
  const defaultSortField =
    command === 'limit-down-pool' ? 'last_limit_time' : 'price_change_ratio_pct';
  return {
    id: `special.${command}`,
    command: ['special', command],
    description,
    endpoint,
    method: 'GET',
    inputSchema: z
      .object({
        dateMs: z.number().int().nonnegative().optional(),
        page: z.number().int().min(1).default(1),
        size: z.number().int().min(1).max(200).default(50),
        sortField: z.enum(sortFields).default(defaultSortField),
        sortDir: z.enum(['asc', 'desc']).default('desc'),
      })
      .strict(),
    outputSchema: itemOutput,
    options: [
      {
        flags: '--date-ms <milliseconds>',
        description: 'trade date at Asia/Shanghai midnight',
        type: 'integer',
        queryName: 'date_ms',
      },
      { flags: '--page <number>', description: 'page number', type: 'integer', defaultValue: 1 },
      {
        flags: '--size <number>',
        description: 'page size (1-200)',
        type: 'integer',
        defaultValue: 50,
      },
      {
        flags: '--sort-field <field>',
        description: 'sort field',
        type: 'string',
        choices: sortFields,
        defaultValue: defaultSortField,
        queryName: 'sort_field',
      },
      {
        flags: '--sort-dir <direction>',
        description: 'sort direction',
        type: 'string',
        choices: ['asc', 'desc'],
        defaultValue: 'desc',
        queryName: 'sort_dir',
      },
    ],
    paging: 'page',
    window: 'none',
  };
}

function derivativeCapability(
  domain: 'futures' | 'options',
  command: string,
  description: string,
  endpoint: string,
  inputSchema: ZodType<Record<string, unknown>> = z.object({}).strict(),
  options: readonly RemoteOptionDescriptor[] = [],
  outputSchema: ZodType<unknown> = itemOutput,
  window: RemoteCapabilityDescriptor['window'] = 'none',
  paging: RemoteCapabilityDescriptor['paging'] = 'none',
): RemoteCapabilityDescriptor {
  return {
    id: `${domain}.${command}`,
    command: [domain, command],
    description,
    endpoint,
    method: 'GET',
    inputSchema,
    outputSchema,
    options,
    paging,
    window,
  };
}

const thscodeOption: RemoteOptionDescriptor = {
  flags: '--thscode <code>',
  description: 'full futures or options thscode',
  type: 'string',
  required: true,
};
const derivativeContractListInput = z
  .object({
    limit: z.number().int().min(1).max(1000).optional(),
    offset: z.number().int().min(0).optional(),
  })
  .strict();
const derivativeContractListOptions: readonly RemoteOptionDescriptor[] = [
  {
    flags: '--limit <number>',
    description: 'page size (1-1000)',
    type: 'integer',
    defaultValue: 100,
  },
  { flags: '--offset <number>', description: 'row offset', type: 'integer', defaultValue: 0 },
];
const sessionOption: RemoteOptionDescriptor = {
  flags: '--session <session>',
  description: 'trading session',
  type: 'string',
  choices: ['pre_market', 'intraday', 'post_market'],
  defaultValue: 'intraday',
};
const derivativeDailyInput = z
  .object({
    thscode: derivativeCode,
    start: z.number().int().positive().optional(),
    end: z.number().int().positive().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.start === undefined) !== (value.end === undefined))
      context.addIssue({ code: 'custom', message: 'start and end must be provided together' });
    if (value.start !== undefined && value.end !== undefined && value.start > value.end)
      context.addIssue({ code: 'custom', message: 'start must be <= end' });
  });
const derivativeDailyOptions: readonly RemoteOptionDescriptor[] = [
  thscodeOption,
  {
    flags: '--start <milliseconds>',
    description: 'range start in Unix milliseconds',
    type: 'integer',
  },
  { flags: '--end <milliseconds>', description: 'range end in Unix milliseconds', type: 'integer' },
];
const derivativeIntradayInput = z
  .object({
    thscode: derivativeCode,
    session: z.enum(['pre_market', 'intraday', 'post_market']).default('intraday'),
  })
  .strict();
const derivativeIntradayOptions: readonly RemoteOptionDescriptor[] = [thscodeOption, sessionOption];

const baseRemoteCapabilities: readonly RemoteCapabilityDescriptor[] = [
  {
    id: 'symbol.search',
    command: ['symbol', 'search'],
    description: 'Resolve a name or code to thscode',
    endpoint: '/api/meta/tickers/search',
    method: 'GET',
    inputSchema: z
      .object({
        q: z.string().min(1),
        exchange: z.enum(['SH', 'SZ', 'BJ']).optional(),
        assetType: assetTypeCsv.optional(),
        limit: z.number().int().min(1).max(50).default(10),
      })
      .strict(),
    outputSchema: itemOutput,
    options: [
      {
        flags: '--q <query>',
        description: 'name, ticker, or thscode',
        type: 'string',
        required: true,
      },
      {
        flags: '--exchange <exchange>',
        description: 'exchange filter',
        type: 'string',
        choices: ['SH', 'SZ', 'BJ'],
      },
      {
        flags: '--asset-type <type>',
        type: 'string',
        description: `comma-separated asset types: ${assetTypes.join(', ')}`,
        queryName: 'asset_type',
      },
      {
        flags: '--limit <number>',
        description: 'maximum matches (1-50)',
        type: 'integer',
        defaultValue: 10,
      },
    ],
    paging: 'none',
    window: 'none',
  },
  {
    id: 'symbol.list',
    command: ['symbol', 'list'],
    description: 'List symbols with bounded pagination',
    endpoint: '/api/meta/tickers/list',
    method: 'GET',
    inputSchema: z
      .object({
        exchange: z.string().default('SH,SZ'),
        assetType: assetTypeCsv.default('a-share'),
        limit: z.number().int().min(1).max(10000).default(1000),
        offset: z.number().int().nonnegative().default(0),
      })
      .strict(),
    outputSchema: itemOutput,
    options: [
      {
        flags: '--exchange <exchanges>',
        description: 'comma-separated exchanges',
        type: 'string',
        defaultValue: 'SH,SZ',
      },
      {
        flags: '--asset-type <type>',
        type: 'string',
        description: `comma-separated asset types: ${assetTypes.join(', ')}`,
        defaultValue: 'a-share',
        queryName: 'asset_type',
      },
      {
        flags: '--limit <number>',
        description: 'page size (1-10000)',
        type: 'integer',
        defaultValue: 1000,
      },
      { flags: '--offset <number>', description: 'row offset', type: 'integer', defaultValue: 0 },
    ],
    paging: 'offset',
    window: 'none',
  },
  {
    id: 'market.snapshot',
    command: ['market', 'snapshot'],
    description: 'Query A-share price snapshots',
    endpoint: '/api/a-share/prices/snapshot',
    method: 'GET',
    inputSchema: z
      .object({
        thscodes: commaCodes.optional(),
        limit: z.number().int().min(1).max(10000).default(100),
        offset: z.number().int().nonnegative().default(0),
      })
      .strict(),
    outputSchema: itemOutput,
    options: [
      {
        flags: '--thscodes <codes>',
        description: 'comma-separated A-share thscodes',
        type: 'string',
      },
      { flags: '--limit <number>', description: 'page size', type: 'integer', defaultValue: 100 },
      { flags: '--offset <number>', description: 'row offset', type: 'integer', defaultValue: 0 },
    ],
    paging: 'offset',
    window: 'none',
  },
  {
    id: 'market.history',
    command: ['market', 'history'],
    description: 'Query daily A-share history',
    endpoint: '/api/a-share/prices/historical',
    method: 'GET',
    inputSchema: historyInput,
    outputSchema: itemOutput,
    options: [
      {
        flags: '--thscode <code>',
        description: 'single A-share thscode',
        type: 'string',
        required: true,
      },
      {
        flags: '--start-ms <milliseconds>',
        description: 'start timestamp',
        type: 'integer',
        required: true,
        queryName: 'start',
      },
      {
        flags: '--end-ms <milliseconds>',
        description: 'end timestamp',
        type: 'integer',
        required: true,
        queryName: 'end',
      },
      {
        flags: '--adjust <mode>',
        description: 'adjustment mode',
        type: 'string',
        choices: ['none', 'forward', 'backward'],
        defaultValue: 'forward',
      },
    ],
    paging: 'none',
    window: 'ten-years',
  },
  {
    id: 'market.corporate-actions',
    command: ['market', 'corporate-actions'],
    description: 'Query adjustment events',
    endpoint: '/api/a-share/corporate-actions/adjustment-factors',
    method: 'GET',
    inputSchema: z
      .object({ thscode: aShareCode, fromDate: isoDate.optional(), toDate: isoDate.optional() })
      .strict(),
    outputSchema: itemOutput,
    options: [
      {
        flags: '--thscode <code>',
        description: 'single A-share thscode',
        type: 'string',
        required: true,
      },
      {
        flags: '--from-date <date>',
        description: 'first ex-date YYYY-MM-DD',
        type: 'string',
        queryName: 'from',
      },
      {
        flags: '--to-date <date>',
        description: 'last ex-date YYYY-MM-DD',
        type: 'string',
        queryName: 'to',
      },
    ],
    paging: 'none',
    window: 'none',
  },
  financial('financials.income', 'income', '/api/a-share/financials/income-statements'),
  financial('financials.balance-sheet', 'balance-sheet', '/api/a-share/financials/balance-sheets'),
  financial('financials.cash-flow', 'cash-flow', '/api/a-share/financials/cash-flow-statements'),
  {
    id: 'financials.indicators',
    command: ['financials', 'indicators'],
    description: 'Query financial indicators for a report',
    endpoint: '/api/a-share/financials/indicators',
    method: 'GET',
    inputSchema: z
      .object({ thscode: aShareCode, report: z.string().regex(/^\d{4}-[1-4]$/u) })
      .strict(),
    outputSchema: z.object({ abilities: z.array(record) }).passthrough(),
    options: [
      {
        flags: '--thscode <code>',
        description: 'single A-share thscode',
        type: 'string',
        required: true,
      },
      {
        flags: '--report <period>',
        description: 'report quarter YYYY-[1-4]',
        type: 'string',
        required: true,
      },
    ],
    paging: 'none',
    window: 'none',
  },
  {
    id: 'valuation.snapshot',
    command: ['valuation', 'snapshot'],
    description: 'Query current A-share valuation metrics',
    endpoint: '/api/a-share/valuations/snapshot',
    method: 'GET',
    inputSchema: z.object({ thscodes: valuationCodes }).strict(),
    outputSchema: itemOutput,
    options: [
      {
        flags: '--thscodes <codes>',
        description: 'comma-separated A-share thscodes (at most 100 raw tokens)',
        type: 'string',
        required: true,
      },
    ],
    paging: 'none',
    window: 'none',
  },
  {
    id: 'market.calendar',
    command: ['market', 'calendar'],
    description: 'Query the one-year A-share trading calendar',
    endpoint: '/api/a-share/calendar/trading-days',
    method: 'GET',
    inputSchema: z.object({}).strict(),
    outputSchema: itemOutput,
    options: [],
    paging: 'none',
    window: 'one-year',
  },
  {
    id: 'market.auction-snapshot',
    command: ['market', 'auction-snapshot'],
    description: 'Query auction snapshots whose timestamp is the response assembly timestamp',
    endpoint: '/api/a-share/auction/snapshot',
    method: 'GET',
    inputSchema: z
      .object({ thscodes: valuationCodes, stage: z.enum(['live', 'final']).default('final') })
      .strict(),
    outputSchema: itemOutput,
    options: [
      {
        flags: '--thscodes <codes>',
        description: 'comma-separated A-share thscodes (at most 100 raw tokens)',
        type: 'string',
        required: true,
      },
      {
        flags: '--stage <stage>',
        description: 'auction stage',
        type: 'string',
        choices: ['live', 'final'],
        defaultValue: 'final',
      },
    ],
    paging: 'none',
    window: 'today-only',
  },
  {
    id: 'market.auction-benchmark',
    command: ['market', 'auction-benchmark'],
    description:
      'Query the short-term auction benchmark; omit date for the Asia/Shanghai current date and read resolved date/date_ms from data',
    endpoint: '/api/a-share/auction/short-term-benchmark',
    method: 'GET',
    inputSchema: z.object({ date: isoDate.optional() }).strict(),
    outputSchema: itemOutput,
    options: [
      {
        flags: '--date <date>',
        description: 'optional trade date YYYY-MM-DD; omit for the Asia/Shanghai current date',
        type: 'string',
      },
    ],
    paging: 'none',
    window: 'none',
  },
  {
    id: 'index.catalog',
    command: ['index', 'catalog'],
    description: 'List THS indices by category',
    endpoint: '/api/a-share-index/catalog/ths-index-list',
    method: 'GET',
    inputSchema: z
      .object({ tag: z.enum(['cn_concept', 'region', 'tszs', 'industry']).default('cn_concept') })
      .strict(),
    outputSchema: itemOutput,
    options: [
      {
        flags: '--tag <tag>',
        description: 'index category',
        type: 'string',
        choices: ['cn_concept', 'region', 'tszs', 'industry'],
        defaultValue: 'cn_concept',
      },
    ],
    paging: 'none',
    window: 'none',
  },
  {
    id: 'index.constituents',
    command: ['index', 'constituents'],
    description: 'Query index constituents',
    endpoint: '/api/a-share-index/constituents/ths-stock-list',
    method: 'GET',
    inputSchema: z.object({ thscode: indexCode }).strict(),
    outputSchema: itemOutput,
    options: [
      {
        flags: '--thscode <code>',
        description: 'single index thscode',
        type: 'string',
        required: true,
      },
    ],
    paging: 'none',
    window: 'none',
  },
  {
    id: 'index.snapshot',
    command: ['index', 'snapshot'],
    description: 'Query index price snapshots',
    endpoint: '/api/a-share-index/prices/snapshot',
    method: 'GET',
    inputSchema: z.object({ thscodes: commaCodes }).strict(),
    outputSchema: itemOutput,
    options: [
      {
        flags: '--thscodes <codes>',
        description: 'comma-separated index thscodes',
        type: 'string',
        required: true,
      },
    ],
    paging: 'none',
    window: 'none',
  },
  {
    id: 'index.history',
    command: ['index', 'history'],
    description: 'Query daily index history',
    endpoint: '/api/a-share-index/prices/historical',
    method: 'GET',
    inputSchema: indexHistoryInput,
    outputSchema: itemOutput,
    options: [
      {
        flags: '--thscode <code>',
        description: 'single index thscode',
        type: 'string',
        required: true,
      },
      {
        flags: '--start-ms <milliseconds>',
        description: 'start timestamp',
        type: 'integer',
        required: true,
        queryName: 'start',
      },
      {
        flags: '--end-ms <milliseconds>',
        description: 'end timestamp',
        type: 'integer',
        required: true,
        queryName: 'end',
      },
    ],
    paging: 'none',
    window: 'five-years',
  },
  fundDetail('profile', 'Query fund profile detail', '/api/fund/profile/detail'),
  fundDetail('holdings', 'Query fund portfolio holdings', '/api/fund/portfolio/holdings'),
  {
    id: 'fund.nav',
    command: ['fund', 'nav'],
    description: 'Query fund net asset value series',
    endpoint: '/api/fund/performance/nav',
    method: 'GET',
    inputSchema: z
      .object({
        thscode: fundCode,
        range: z
          .enum(['week', 'month', 'tmonth', 'hyear', 'year', 'twoyear', 'tyear', 'fyear'])
          .optional(),
        navType: z.enum(['unit', 'adj', 'unit,adj']).default('unit,adj'),
      })
      .strict(),
    outputSchema: itemOutput,
    options: [
      {
        flags: '--thscode <code>',
        description: 'single fund thscode',
        type: 'string',
        required: true,
      },
      {
        flags: '--range <range>',
        description: 'NAV history range; omit for the latest point',
        type: 'string',
        choices: ['week', 'month', 'tmonth', 'hyear', 'year', 'twoyear', 'tyear', 'fyear'],
      },
      {
        flags: '--nav-type <type>',
        description: 'NAV fields to return',
        type: 'string',
        choices: ['unit', 'adj', 'unit,adj'],
        defaultValue: 'unit,adj',
        queryName: 'nav_type',
      },
    ],
    paging: 'none',
    window: 'none',
  },
  fundDetail('returns', 'Query fund interval returns', '/api/fund/performance/returns'),
  {
    id: 'fund.holders',
    command: ['fund', 'holders'],
    description: 'Query fund holder structure by disclosure scope',
    endpoint: '/api/fund/holders/detail',
    method: 'GET',
    inputSchema: z
      .object({
        thscode: fundCode,
        mergeScope: z.enum(['all', 'merged', 'separate']).default('all'),
      })
      .strict(),
    outputSchema: itemOutput,
    options: [
      {
        flags: '--thscode <code>',
        description: 'single fund thscode',
        type: 'string',
        required: true,
      },
      {
        flags: '--merge-scope <scope>',
        description: 'holder disclosure scope',
        type: 'string',
        choices: ['all', 'merged', 'separate'],
        defaultValue: 'all',
        queryName: 'merge_scope',
      },
    ],
    paging: 'none',
    window: 'none',
  },
  {
    id: 'fund.snapshot',
    command: ['fund', 'snapshot'],
    description: 'Query exchange-traded fund market snapshot',
    endpoint: '/api/fund/market/snapshot',
    method: 'GET',
    inputSchema: z.object({ thscode: batchCodes(100) }).strict(),
    outputSchema: itemOutput,
    options: [
      {
        flags: '--thscode <code>',
        description: 'comma-separated ETF/LOF thscodes (1-100 raw tokens)',
        type: 'string',
        required: true,
      },
    ],
    paging: 'none',
    window: 'none',
  },
  {
    id: 'fund.history',
    command: ['fund', 'history'],
    description: 'Query forward-adjusted daily ETF price history',
    endpoint: '/api/fund/market/historical',
    method: 'GET',
    inputSchema: fundHistoryInput,
    outputSchema: itemOutput,
    options: [
      {
        flags: '--thscode <code>',
        description: 'single ETF thscode',
        type: 'string',
        required: true,
      },
      {
        flags: '--interval <interval>',
        description: 'bar interval',
        type: 'string',
        choices: ['1d'],
        defaultValue: '1d',
      },
      {
        flags: '--start-ms <milliseconds>',
        description: 'start timestamp',
        type: 'integer',
        required: true,
        queryName: 'start',
      },
      {
        flags: '--end-ms <milliseconds>',
        description: 'end timestamp',
        type: 'integer',
        required: true,
        queryName: 'end',
      },
    ],
    paging: 'none',
    window: 'five-years',
  },
  {
    id: 'fund.company-detail',
    command: ['fund', 'company-detail'],
    description: 'Query fund company detail',
    endpoint: '/api/fund/companies/detail',
    method: 'GET',
    inputSchema: z.object({ companyId: z.string().min(1) }).strict(),
    outputSchema: itemOutput,
    options: [
      {
        flags: '--company-id <id>',
        description: 'fund company identifier',
        type: 'string',
        required: true,
        queryName: 'company_id',
      },
    ],
    paging: 'none',
    window: 'none',
  },
  fundDetail(
    'industry-allocation',
    'Query fund industry allocation',
    '/api/fund/portfolio/industry-allocation',
  ),
  {
    id: 'fund.indicators-history',
    command: ['fund', 'indicators-history'],
    description:
      'Query historical fund performance indicators with data timestamp/item only and no top-level thscode/interval',
    endpoint: '/api/fund/performance/indicators-historical',
    method: 'GET',
    inputSchema: z
      .object({
        thscode: fundCode,
        startMs: z.number().int().nonnegative(),
        endMs: z.number().int().nonnegative(),
      })
      .strict()
      .superRefine((value, context) => {
        if (value.endMs < value.startMs) {
          context.addIssue({ code: 'custom', message: 'end-ms must be >= start-ms' });
          return;
        }
        const latest = new Date(value.startMs);
        latest.setUTCFullYear(latest.getUTCFullYear() + 5);
        if (value.endMs > latest.getTime()) {
          context.addIssue({
            code: 'custom',
            message: 'indicator window must not exceed five years',
          });
        }
      }),
    outputSchema: itemOutput,
    options: [
      {
        flags: '--thscode <code>',
        description: 'single fund thscode',
        type: 'string',
        required: true,
      },
      {
        flags: '--start-ms <milliseconds>',
        description: 'range start in milliseconds',
        type: 'integer',
        required: true,
        queryName: 'start',
      },
      {
        flags: '--end-ms <milliseconds>',
        description: 'range end in milliseconds',
        type: 'integer',
        required: true,
        queryName: 'end',
      },
    ],
    paging: 'none',
    window: 'five-years',
  },
  fundDetail('drawdowns', 'Query fund drawdown periods', '/api/fund/performance/drawdowns'),
  {
    id: 'fund.top-holders',
    command: ['fund', 'top-holders'],
    description: 'Query top fund holders',
    endpoint: '/api/fund/holders/top',
    method: 'GET',
    inputSchema: z
      .object({
        thscode: fundCode,
        limit: z.number().int().min(1).max(10).optional(),
      })
      .strict(),
    outputSchema: itemOutput,
    options: [
      {
        flags: '--thscode <code>',
        description: 'single fund thscode',
        type: 'string',
        required: true,
      },
      { flags: '--limit <number>', description: 'maximum holders (1-10)', type: 'integer' },
    ],
    paging: 'none',
    window: 'none',
  },
  fundDetail('dividends', 'Query fund dividend records', '/api/fund/corporate-actions/dividends'),
  fundDetail('diagnostics', 'Query fund diagnostics', '/api/fund/diagnostics/detail'),
  fundDetail(
    'financial-indicators',
    'Query fund financial indicators',
    '/api/fund/financials/indicators',
  ),
  fundDetail(
    'income-statements',
    'Query fund income statements',
    '/api/fund/financials/income-statements',
  ),
  fundDetail('balance-sheets', 'Query fund balance sheets', '/api/fund/financials/balance-sheets'),
  fundManager(
    'manager-style',
    'Query fund manager investment style',
    '/api/fund/managers/investment-style',
  ),
  fundManager(
    'manager-performance',
    'Query fund manager performance',
    '/api/fund/managers/performance',
  ),
  fundManager(
    'manager-experience',
    'Query fund manager experience',
    '/api/fund/managers/experience',
  ),
  fundManager('manager-detail', 'Query fund manager detail', '/api/fund/managers/detail'),
  {
    id: 'fund.news',
    command: ['fund', 'news'],
    description: 'Query cursor-paginated public fund article metadata with has_more and no total',
    endpoint: '/api/fund/news/article-list',
    method: 'GET',
    inputSchema: z
      .object({
        thscode: fundCode,
        limit: z.number().int().min(1).max(100).default(20),
        offset: z.string().min(1).optional(),
      })
      .strict(),
    outputSchema: itemOutput,
    options: [
      {
        flags: '--thscode <code>',
        description: 'single fund thscode',
        type: 'string',
        required: true,
      },
      {
        flags: '--limit <number>',
        description: 'page size (1-100)',
        type: 'integer',
        defaultValue: 20,
      },
      { flags: '--offset <cursor>', description: 'opaque pagination cursor', type: 'string' },
    ],
    paging: 'offset',
    pagingEnd: 'has-more',
    window: 'none',
  },
  {
    id: 'fund.offerings',
    command: ['fund', 'offerings'],
    description: 'Query active or upcoming fund offerings',
    endpoint: '/api/fund/offerings/list',
    method: 'GET',
    inputSchema: z.object({ subscribe: z.enum(['active', 'upcoming']) }).strict(),
    outputSchema: itemOutput,
    options: [
      {
        flags: '--subscribe <status>',
        description: 'offering status',
        type: 'string',
        required: true,
        choices: ['active', 'upcoming'],
      },
    ],
    paging: 'none',
    window: 'none',
  },
  fundPortfolioHistory(
    'stock-history',
    'Query historical fund stock holdings; rank is populated only for the top 10',
    '/api/fund/portfolio/stock-history',
  ),
  fundReportDates(
    'stock-report-dates',
    'Query fund stock holding report dates',
    '/api/fund/portfolio/stock-report-dates',
  ),
  fundPortfolioHistory(
    'bond-history',
    'Query historical fund bond holdings; rank is populated only for the top 10',
    '/api/fund/portfolio/bond-history',
  ),
  fundReportDates(
    'bond-report-dates',
    'Query fund bond holding report dates',
    '/api/fund/portfolio/bond-report-dates',
  ),
  fundDetail(
    'asset-allocation',
    'Query fund asset allocation',
    '/api/fund/portfolio/asset-allocation',
  ),
  {
    id: 'fund.backtest-result',
    command: ['fund', 'backtest-result'],
    description: 'Run a stateless online fund backtest',
    endpoint: '/api/fund/backtest/result',
    method: 'GET',
    inputSchema: z
      .object({
        thscode: fundCode,
        buyConditions: conditionJson,
        sellConditions: conditionJson,
        buyFrequencyType: z.string().min(1),
        maxBuyTimes: z.number().finite(),
        perBuyAmount: z.number().finite(),
      })
      .strict(),
    outputSchema: objectOutput,
    options: [
      {
        flags: '--thscode <code>',
        description: 'single fund thscode',
        type: 'string',
        required: true,
      },
      {
        flags: '--buy-conditions <json>',
        description: 'buy condition JSON object or array',
        type: 'string',
        required: true,
        queryName: 'buy_conditions',
      },
      {
        flags: '--sell-conditions <json>',
        description: 'sell condition JSON object or array',
        type: 'string',
        required: true,
        queryName: 'sell_conditions',
      },
      {
        flags: '--buy-frequency-type <type>',
        description: 'upstream buy frequency type',
        type: 'string',
        required: true,
        queryName: 'buy_frequency_type',
      },
      {
        flags: '--max-buy-times <number>',
        description: 'maximum buy count',
        type: 'number',
        required: true,
        queryName: 'max_buy_times',
      },
      {
        flags: '--per-buy-amount <number>',
        description: 'amount for each buy',
        type: 'number',
        required: true,
        queryName: 'per_buy_amount',
      },
    ],
    paging: 'none',
    window: 'none',
  },
  {
    id: 'fund.backtest-indicators',
    command: ['fund', 'backtest-indicators'],
    description: 'List indicators supported by the fund backtest service',
    endpoint: '/api/fund/backtest/indicators',
    method: 'GET',
    inputSchema: z.object({}).strict(),
    outputSchema: arrayOutput,
    options: [],
    paging: 'none',
    window: 'none',
  },
  {
    id: 'fund.indicators-line',
    command: ['fund', 'indicators-line'],
    description: 'Query line-oriented fund indicators',
    endpoint: '/api/fund/indicators/line',
    method: 'GET',
    inputSchema: z.object({ indexes: lineIndexesJson, timeRange: timeRangeJson }).strict(),
    outputSchema: objectOutput,
    options: [
      {
        flags: '--indexes <json>',
        description:
          'JSON array of groups: thscodes[], index_info[] with required index_id and optional attribute',
        type: 'string',
        required: true,
      },
      {
        flags: '--time-range <json>',
        description:
          'JSON object: required time_type; optional Unix-millisecond start/end and integer offset',
        type: 'string',
        required: true,
        queryName: 'time_range',
      },
    ],
    paging: 'none',
    window: 'none',
  },
  {
    id: 'fund.indicators-table',
    command: ['fund', 'indicators-table'],
    description: 'Query table-oriented fund indicators',
    endpoint: '/api/fund/indicators/table',
    method: 'GET',
    inputSchema: z
      .object({
        codeSelectors: tableSelectorsJson.optional(),
        indexes: tableIndexesJson.optional(),
        pageInfo: pageInfoJson.optional(),
        sort: sortJson.optional(),
      })
      .strict(),
    outputSchema: objectOutput,
    options: [
      {
        flags: '--code-selectors <json>',
        description:
          'JSON object with include[]; fund_code/stock_code selectors use thscodes[], other types use values[]',
        type: 'string',
        queryName: 'code_selectors',
      },
      {
        flags: '--indexes <json>',
        description: 'JSON array: required index_id; optional timestamp and attribute',
        type: 'string',
      },
      {
        flags: '--page-info <json>',
        description:
          'JSON object: optional integer page_begin/page_size/code_begin/code_page_size; verify progress from returned rows',
        type: 'string',
        queryName: 'page_info',
      },
      {
        flags: '--sort <json>',
        description: 'JSON array with required integer idx and string type',
        type: 'string',
      },
    ],
    paging: 'json',
    window: 'none',
  },
  {
    id: 'fund.quota-summary',
    command: ['fund', 'quota-summary'],
    description: 'Query QDII quota summaries by category',
    endpoint: '/api/fund/quota/summary',
    method: 'GET',
    inputSchema: z.object({ tab: quotaTabsJson }).strict(),
    outputSchema: arrayOutput,
    options: [
      {
        flags: '--tab <json>',
        description: 'category name JSON array',
        type: 'string',
        required: true,
      },
    ],
    paging: 'none',
    window: 'none',
  },
  {
    id: 'fund.quota-list',
    command: ['fund', 'quota-list'],
    description: 'Query QDII fund quotas by category',
    endpoint: '/api/fund/quota/list',
    method: 'GET',
    inputSchema: z.object({ tab: quotaTabsJson, buy: z.boolean().optional() }).strict(),
    outputSchema: arrayOutput,
    options: [
      {
        flags: '--tab <json>',
        description: 'category name JSON array',
        type: 'string',
        required: true,
      },
      {
        flags: '--buy <boolean>',
        description: 'optional true/false purchasable filter',
        type: 'boolean',
      },
    ],
    paging: 'none',
    window: 'none',
  },
  derivativeCapability(
    'futures',
    'varieties',
    'List public futures varieties',
    '/api/futures/varieties/list',
  ),
  derivativeCapability(
    'futures',
    'variety-plates',
    'List futures variety plates',
    '/api/futures/variety-plates/list',
  ),
  derivativeCapability(
    'futures',
    'contract-detail',
    'Query futures contract details',
    '/api/futures/contracts/detail',
    z.object({ thscode: derivativeCode }).strict(),
    [thscodeOption],
    objectOutput,
  ),
  derivativeCapability(
    'futures',
    'contracts',
    'List futures contracts',
    '/api/futures/contracts/list',
    derivativeContractListInput,
    derivativeContractListOptions,
    itemOutput,
    'none',
    'offset',
  ),
  derivativeCapability(
    'futures',
    'main-continuous',
    'List futures main-continuous contracts',
    '/api/futures/contracts/main-continuous-list',
  ),
  derivativeCapability(
    'futures',
    'main',
    'List futures main contracts',
    '/api/futures/contracts/main-list',
  ),
  derivativeCapability(
    'futures',
    'secondary-main',
    'List futures secondary-main contracts',
    '/api/futures/contracts/secondary-main-list',
  ),
  derivativeCapability(
    'futures',
    'commodity-indexes',
    'List futures commodity indexes',
    '/api/futures/contracts/commodity-index-list',
  ),
  derivativeCapability(
    'futures',
    'variety-positions',
    'Query daily futures variety positions',
    '/api/futures/positions/variety-daily',
    z.object({ date: isoDate }).strict(),
    [
      {
        flags: '--date <date>',
        description: 'trading date (YYYY-MM-DD)',
        type: 'string',
        required: true,
      },
    ],
  ),
  derivativeCapability(
    'futures',
    'company-variety-positions',
    'Query daily company positions by futures varieties',
    '/api/futures/positions/company-variety-daily',
    z.object({ date: isoDate, varieties: derivativeList }).strict(),
    [
      {
        flags: '--date <date>',
        description: 'trading date (YYYY-MM-DD)',
        type: 'string',
        required: true,
      },
      {
        flags: '--varieties <codes>',
        description: '1 to 5 comma-separated variety codes',
        type: 'string',
        required: true,
      },
    ],
  ),
  derivativeCapability(
    'futures',
    'contract-positions',
    'Query daily futures contract positions',
    '/api/futures/positions/contract-daily',
    z.object({ thscode: derivativeCode, variety: derivativeVariety, date: isoDate }).strict(),
    [
      thscodeOption,
      {
        flags: '--variety <code>',
        description: 'uppercase futures variety code',
        type: 'string',
        required: true,
      },
      {
        flags: '--date <date>',
        description: 'trading date (YYYY-MM-DD)',
        type: 'string',
        required: true,
      },
    ],
    objectOutput,
  ),
  derivativeCapability(
    'futures',
    'contract-position-history',
    'Query up to one year of futures contract positions',
    '/api/futures/positions/contract-historical',
    z
      .object({
        thscode: derivativeCode,
        variety: derivativeVariety,
        company: z.string().trim().min(1),
        startDate: isoDate,
      })
      .strict(),
    [
      thscodeOption,
      {
        flags: '--variety <code>',
        description: 'uppercase futures variety code',
        type: 'string',
        required: true,
      },
      {
        flags: '--company <name>',
        description: 'futures company name',
        type: 'string',
        required: true,
      },
      {
        flags: '--start-date <date>',
        description: 'start date within the last year',
        type: 'string',
        required: true,
        queryName: 'start_date',
      },
    ],
    objectOutput,
    'one-year',
  ),
  derivativeCapability(
    'futures',
    'position-companies',
    'List futures position companies',
    '/api/futures/positions/company-list',
  ),
  derivativeCapability(
    'futures',
    'warehouse-receipts',
    'Query historical futures warehouse receipts',
    '/api/futures/warehouse-receipts/historical',
    z
      .object({ thscode: derivativeCode, startDate: isoDate, endDate: isoDate })
      .strict()
      .refine((value) => value.startDate <= value.endDate, {
        message: 'start-date must be <= end-date',
      }),
    [
      thscodeOption,
      {
        flags: '--start-date <date>',
        description: 'range start (YYYY-MM-DD)',
        type: 'string',
        required: true,
        queryName: 'start_date',
      },
      {
        flags: '--end-date <date>',
        description: 'range end (YYYY-MM-DD)',
        type: 'string',
        required: true,
        queryName: 'end_date',
      },
    ],
  ),
  derivativeCapability(
    'futures',
    'latest-basis',
    'Query latest main-continuous futures basis',
    '/api/futures/basis/main-continuous-latest',
  ),
  derivativeCapability(
    'futures',
    'basis-history',
    'Query historical futures basis',
    '/api/futures/basis/historical',
    z
      .object({ thscode: derivativeCode, spotIndicatorId: z.string().trim().min(1).optional() })
      .strict(),
    [
      thscodeOption,
      {
        flags: '--spot-indicator-id <id>',
        description: 'optional spot indicator identifier',
        type: 'string',
        queryName: 'spot_indicator_id',
      },
    ],
  ),
  derivativeCapability(
    'futures',
    'trading-schedule',
    'Query futures trading schedule',
    '/api/futures/calendar/trading-schedule',
    z
      .object({ thscode: derivativeCode, startDate: isoDate, endDate: isoDate })
      .strict()
      .refine((value) => value.startDate <= value.endDate, {
        message: 'start-date must be <= end-date',
      }),
    [
      thscodeOption,
      {
        flags: '--start-date <date>',
        description: 'range start (YYYY-MM-DD)',
        type: 'string',
        required: true,
        queryName: 'start_date',
      },
      {
        flags: '--end-date <date>',
        description: 'range end (YYYY-MM-DD)',
        type: 'string',
        required: true,
        queryName: 'end_date',
      },
    ],
    objectOutput,
  ),
  derivativeCapability(
    'futures',
    'session-timeline',
    'Query futures session timeline',
    '/api/futures/calendar/session-timeline',
    z.object({ thscode: derivativeCode }).strict(),
    [thscodeOption],
    objectOutput,
  ),
  derivativeCapability(
    'futures',
    'intraday',
    'Query current futures session intraday prices',
    '/api/futures/prices/intraday',
    derivativeIntradayInput,
    derivativeIntradayOptions,
    objectOutput,
    'today-only',
  ),
  derivativeCapability(
    'futures',
    'daily',
    'Query fixed 1d futures prices',
    '/api/futures/prices/daily',
    derivativeDailyInput,
    derivativeDailyOptions,
    objectOutput,
  ),
  derivativeCapability(
    'options',
    'varieties',
    'List public options varieties',
    '/api/options/varieties/list',
  ),
  derivativeCapability(
    'options',
    'contract-detail',
    'Query options contract details',
    '/api/options/contracts/detail',
    z.object({ thscode: derivativeCode }).strict(),
    [thscodeOption],
    objectOutput,
  ),
  derivativeCapability(
    'options',
    'contracts',
    'List options contracts',
    '/api/options/contracts/list',
    derivativeContractListInput,
    derivativeContractListOptions,
    itemOutput,
    'none',
    'offset',
  ),
  derivativeCapability(
    'options',
    'session-timeline',
    'Query options session timeline',
    '/api/options/calendar/session-timeline',
    z.object({ thscode: derivativeCode }).strict(),
    [thscodeOption],
    objectOutput,
  ),
  derivativeCapability(
    'options',
    'intraday',
    'Query current options session intraday prices',
    '/api/options/prices/intraday',
    derivativeIntradayInput,
    derivativeIntradayOptions,
    objectOutput,
    'today-only',
  ),
  derivativeCapability(
    'options',
    'daily',
    'Query fixed 1d options prices',
    '/api/options/prices/daily',
    derivativeDailyInput,
    derivativeDailyOptions,
    objectOutput,
  ),
  {
    id: 'special.limit-up-pool',
    command: ['special', 'limit-up-pool'],
    description: 'Query the limit-up stock pool',
    endpoint: '/api/a-share/special-data/limit-up-pool',
    method: 'GET',
    inputSchema: z
      .object({
        dateMs: z.number().int().nonnegative().optional(),
        page: z.number().int().min(1).default(1),
        size: z.number().int().min(1).max(200).default(50),
        sortField: z
          .enum(['last_price', 'continue_day_cnt', 'seal_money', 'limit_up_time'])
          .default('last_price'),
        sortDir: z.enum(['asc', 'desc']).default('desc'),
      })
      .strict(),
    outputSchema: itemOutput,
    options: [
      {
        flags: '--date-ms <milliseconds>',
        description: 'trade date at Asia/Shanghai midnight',
        type: 'integer',
        queryName: 'date_ms',
      },
      { flags: '--page <number>', description: 'page number', type: 'integer', defaultValue: 1 },
      {
        flags: '--size <number>',
        description: 'page size (1-200)',
        type: 'integer',
        defaultValue: 50,
      },
      {
        flags: '--sort-field <field>',
        description: 'sort field',
        type: 'string',
        choices: ['last_price', 'continue_day_cnt', 'seal_money', 'limit_up_time'],
        defaultValue: 'last_price',
        queryName: 'sort_field',
      },
      {
        flags: '--sort-dir <direction>',
        description: 'sort direction',
        type: 'string',
        choices: ['asc', 'desc'],
        defaultValue: 'desc',
        queryName: 'sort_dir',
      },
    ],
    paging: 'page',
    window: 'none',
  },
  specialPool(
    'limit-down-pool',
    'Query the limit-down stock pool',
    '/api/a-share/special-data/limit-down-pool',
  ),
  specialPool(
    'limit-break-pool',
    'Query the limit-break stock pool',
    '/api/a-share/special-data/limit-break-pool',
  ),
  {
    id: 'special.limit-up-ladder',
    command: ['special', 'limit-up-ladder'],
    description: 'Query the 30-day limit-up ladder',
    endpoint: '/api/a-share/special-data/limit-up-ladder',
    method: 'GET',
    inputSchema: z.object({}).strict(),
    outputSchema: itemOutput,
    options: [],
    paging: 'none',
    window: 'none',
  },
  {
    id: 'special.anomaly-list',
    command: ['special', 'anomaly-list'],
    description: 'Query today-only anomaly analysis rows',
    endpoint: '/api/a-share/special-data/anomaly-analysis-list',
    method: 'GET',
    inputSchema: z
      .object({
        tagCodes: z
          .string()
          .refine((value) =>
            value
              .split(',')
              .every(
                (token) =>
                  [
                    'LIMIT_UP',
                    'LIMIT_DOWN',
                    'SHARP_RISE',
                    'SHARP_FALL',
                    'RAPID_RALLY',
                    'RAPID_DECLINE',
                  ].includes(token.toUpperCase()) && token.length > 0,
              ),
          )
          .optional(),
      })
      .strict(),
    outputSchema: itemOutput,
    options: [
      {
        flags: '--tag-codes <codes>',
        description: 'comma-separated anomaly tags',
        type: 'string',
        queryName: 'tag_codes',
      },
    ],
    paging: 'none',
    window: 'today-only',
  },
  {
    id: 'special.anomaly-stock',
    command: ['special', 'anomaly-stock'],
    description: 'Query today-only anomalies for up to 50 raw code tokens',
    endpoint: '/api/a-share/special-data/anomaly-analysis-stock',
    method: 'GET',
    inputSchema: z
      .object({
        thscodes: z
          .string()
          .superRefine((value, context) => {
            const tokens = value.split(',');
            if (tokens.length > 50)
              context.addIssue({ code: 'custom', message: 'at most 50 raw tokens' });
            if (tokens.some((token) => !/^\d{6}\.(SH|SZ|BJ)$/iu.test(token.trim())))
              context.addIssue({ code: 'custom', message: 'invalid or empty A-share token' });
          })
          .transform((value) =>
            [...new Set(value.split(',').map((token) => token.trim().toUpperCase()))].join(','),
          ),
      })
      .strict(),
    outputSchema: itemOutput,
    options: [
      {
        flags: '--thscodes <codes>',
        description: '1-50 comma-separated A-share thscodes',
        type: 'string',
        required: true,
      },
    ],
    paging: 'none',
    window: 'today-only',
  },
  {
    id: 'special.skyrocket',
    command: ['special', 'skyrocket'],
    description: 'Query the skyrocket ranking',
    endpoint: '/api/a-share/special-data/skyrocket-list',
    method: 'GET',
    inputSchema: z
      .object({
        period: z.enum(['day', 'hour']).default('day'),
        limit: z.number().int().min(1).max(100).default(30),
      })
      .strict(),
    outputSchema: itemOutput,
    options: [
      {
        flags: '--limit <number>',
        description: 'ranking rows (1-100)',
        type: 'integer',
        defaultValue: 30,
      },
      {
        flags: '--period <period>',
        description: 'ranking period',
        type: 'string',
        choices: ['day', 'hour'],
        defaultValue: 'day',
      },
    ],
    paging: 'none',
    window: 'none',
  },
  {
    id: 'special.hot-stock',
    command: ['special', 'hot-stock'],
    description: 'Query the current hot-stock ranking',
    endpoint: '/api/a-share/special-data/hot-stock-list',
    method: 'GET',
    inputSchema: z
      .object({
        period: z.enum(['day', 'hour']).default('day'),
        limit: z.number().int().min(1).max(100).default(30),
      })
      .strict(),
    outputSchema: itemOutput,
    options: [
      {
        flags: '--limit <number>',
        description: 'ranking rows (1-100)',
        type: 'integer',
        defaultValue: 30,
      },
      {
        flags: '--period <period>',
        description: 'ranking period',
        type: 'string',
        choices: ['day', 'hour'],
        defaultValue: 'day',
      },
    ],
    paging: 'none',
    window: 'none',
  },
  {
    id: 'special.hot-stock-history',
    command: ['special', 'hot-stock-history'],
    description: 'Query a historical hot-stock ranking',
    endpoint: '/api/a-share/special-data/hot-stock-list-history',
    method: 'GET',
    inputSchema: z.object({ date: isoDate }).strict(),
    outputSchema: itemOutput,
    options: [
      {
        flags: '--date <date>',
        description: 'trade date YYYY-MM-DD',
        type: 'string',
        required: true,
      },
    ],
    paging: 'none',
    window: 'one-year',
  },
  {
    id: 'special.hot-stock-trend',
    command: ['special', 'hot-stock-trend'],
    description: 'Query one stock hot-rank trend',
    endpoint: '/api/a-share/special-data/hot-stock-rank-trend',
    method: 'GET',
    inputSchema: z
      .object({ thscode: aShareCode, startDate: isoDate, endDate: isoDate })
      .strict()
      .refine((value) => value.startDate <= value.endDate, {
        message: 'start-date must be <= end-date',
      }),
    outputSchema: itemOutput,
    options: [
      {
        flags: '--thscode <code>',
        description: 'single A-share thscode',
        type: 'string',
        required: true,
      },
      {
        flags: '--start-date <date>',
        description: 'start date YYYY-MM-DD',
        type: 'string',
        required: true,
        queryName: 'start_date',
      },
      {
        flags: '--end-date <date>',
        description: 'end date YYYY-MM-DD',
        type: 'string',
        required: true,
        queryName: 'end_date',
      },
    ],
    paging: 'none',
    window: 'one-year',
  },
  {
    id: 'special.dragon-tiger',
    command: ['special', 'dragon-tiger'],
    description: 'Query dragon-tiger board records',
    endpoint: '/api/a-share/special-data/dragon-tiger-list',
    method: 'GET',
    inputSchema: z
      .object({
        boardType: z.enum(['all', 'org', 'hot_money']).default('all'),
        date: isoDate.optional(),
      })
      .strict(),
    outputSchema: objectOutput,
    options: [
      {
        flags: '--board-type <type>',
        description: 'board category',
        type: 'string',
        choices: ['all', 'org', 'hot_money'],
        defaultValue: 'all',
        queryName: 'board_type',
      },
      { flags: '--date <date>', description: 'optional trade date YYYY-MM-DD', type: 'string' },
    ],
    paging: 'none',
    window: 'one-year',
  },
  {
    id: 'special.limit-up-statistics',
    command: ['special', 'limit-up-statistics'],
    description: 'Query limit-up market and board statistics',
    endpoint: '/api/a-share/special-data/limit-up-statistics',
    method: 'GET',
    inputSchema: z.object({ date: calendarDate.optional() }).strict(),
    outputSchema: objectOutput,
    options: [{ flags: '--date <value>', description: 'optional date YYYY-MM-DD', type: 'string' }],
    paging: 'none',
    window: 'one-year',
  },
  {
    id: 'special.dragon-tiger-stock-institution',
    command: ['special', 'dragon-tiger-stock-institution'],
    description: 'Query institution amounts for a single stock',
    endpoint: '/api/a-share/special-data/dragon-tiger-stock-institution',
    method: 'GET',
    inputSchema: z
      .object({
        thscode: aShareCode,
        date: calendarDate.optional(),
        rangeDays: z.union([z.literal(1), z.literal(3)]).optional(),
      })
      .strict(),
    outputSchema: objectOutput,
    options: [
      { flags: '--thscode <value>', description: 'thscode', type: 'string', required: true },
      { flags: '--date <value>', description: 'optional date YYYY-MM-DD', type: 'string' },
      {
        flags: '--range-days <value>',
        description: 'listing range: 1 or 3 days; omit for both',
        type: 'integer',
        queryName: 'range_days',
      },
    ],
    paging: 'none',
    window: 'one-year',
  },
  {
    id: 'special.dragon-tiger-department-classic-record',
    command: ['special', 'dragon-tiger-department-classic-record'],
    description: 'Query department classic records',
    endpoint: '/api/a-share/special-data/dragon-tiger-department-classic-record',
    method: 'GET',
    inputSchema: z.object({ departmentId }).strict(),
    outputSchema: objectOutput,
    options: [
      {
        flags: '--department-id <value>',
        description: 'department record identifier (1-128 characters)',
        type: 'string',
        required: true,
        queryName: 'department_id',
      },
    ],
    paging: 'none',
    window: 'none',
  },
  {
    id: 'special.dragon-tiger-department-history',
    command: ['special', 'dragon-tiger-department-history'],
    description: 'Query a page of department historical records',
    endpoint: '/api/a-share/special-data/dragon-tiger-department-history',
    method: 'GET',
    inputSchema: z
      .object({
        departmentId,
        page: z.number().int().min(1).max(2147483647).default(1),
        size: z.number().int().min(1).max(30).default(30),
        minNetBuyAmount: z
          .union([
            z.literal(5000000),
            z.literal(30000000),
            z.literal(50000000),
            z.literal(100000000),
          ])
          .optional(),
        sortField: z.enum(['trade_date', 'change_ratio', 'net_buy_amount']).default('trade_date'),
        sortDir: z.enum(['asc', 'desc']).default('desc'),
      })
      .strict(),
    outputSchema: businessPageOutput,
    options: [
      {
        flags: '--department-id <value>',
        description: 'department record identifier (1-128 characters)',
        type: 'string',
        required: true,
        queryName: 'department_id',
      },
      {
        flags: '--page <value>',
        description: 'page number starting at 1',
        type: 'integer',
        defaultValue: 1,
      },
      {
        flags: '--size <value>',
        description: 'page rows (1-30)',
        type: 'integer',
        defaultValue: 30,
      },
      {
        flags: '--min-net-buy-amount <value>',
        description: 'minimum net buy bucket in CNY: 5000000, 30000000, 50000000 or 100000000',
        type: 'integer',
        queryName: 'min_net_buy_amount',
      },
      {
        flags: '--sort-field <value>',
        description: 'sort-field',
        type: 'string',
        defaultValue: 'trade_date',
        choices: ['trade_date', 'change_ratio', 'net_buy_amount'],
        queryName: 'sort_field',
      },
      {
        flags: '--sort-dir <value>',
        description: 'sort-dir',
        type: 'string',
        defaultValue: 'desc',
        choices: ['asc', 'desc'],
        queryName: 'sort_dir',
      },
    ],
    paging: 'page',
    window: 'none',
  },
  {
    id: 'special.abnormal-monitor',
    command: ['special', 'abnormal-monitor'],
    description: 'Query severe anomaly and monitored stock records',
    endpoint: '/api/a-share/special-data/abnormal-monitor-list',
    method: 'GET',
    inputSchema: z
      .object({
        state: z.enum(['current', 'history']).default('current'),
        page: z.number().int().min(1).max(2147483647).default(1),
        size: z.number().int().min(1).max(30).default(30),
      })
      .strict(),
    outputSchema: businessPageOutput,
    options: [
      {
        flags: '--state <value>',
        description: 'state',
        type: 'string',
        defaultValue: 'current',
        choices: ['current', 'history'],
      },
      {
        flags: '--page <value>',
        description: 'page number starting at 1',
        type: 'integer',
        defaultValue: 1,
      },
      {
        flags: '--size <value>',
        description: 'page rows (1-30)',
        type: 'integer',
        defaultValue: 30,
      },
    ],
    paging: 'page',
    window: 'none',
  },
  {
    id: 'special.auction-opportunities',
    command: ['special', 'auction-opportunities'],
    description: 'Query real-time or historical auction opportunities',
    endpoint: '/api/a-share/special-data/auction-stock-opportunities',
    method: 'GET',
    inputSchema: z
      .object({
        date: calendarDate.optional(),
        warnTypes: opportunityTypes.optional(),
        market: z.enum(['a_share', 'sh_sz_main', 'sh_a', 'sz_a', 'gem', 'star']).default('a_share'),
        excludeSt: z.boolean().default(false),
        thscodes: businessCodes.optional(),
        sortBy: z.enum(['warn_time', 'warn_type']).default('warn_time'),
        sortOrder: z.enum(['asc', 'desc']).default('desc'),
        page: z.number().int().min(1).max(2147483647).default(1),
        size: z.number().int().min(1).max(20).default(20),
      })
      .strict(),
    outputSchema: objectOutput,
    options: [
      { flags: '--date <value>', description: 'optional date YYYY-MM-DD', type: 'string' },
      {
        flags: '--warn-types <value>',
        description: 'comma-separated opportunity types 68710 through 68727',
        type: 'string',
        queryName: 'warn_types',
      },
      {
        flags: '--market <value>',
        description: 'market',
        type: 'string',
        defaultValue: 'a_share',
        choices: ['a_share', 'sh_sz_main', 'sh_a', 'sz_a', 'gem', 'star'],
      },
      {
        flags: '--exclude-st <value>',
        description: 'exclude-st',
        type: 'boolean',
        defaultValue: false,
        queryName: 'exclude_st',
      },
      { flags: '--thscodes <value>', description: 'thscodes', type: 'string' },
      {
        flags: '--sort-by <value>',
        description: 'sort-by',
        type: 'string',
        defaultValue: 'warn_time',
        choices: ['warn_time', 'warn_type'],
        queryName: 'sort_by',
      },
      {
        flags: '--sort-order <value>',
        description: 'sort-order',
        type: 'string',
        defaultValue: 'desc',
        choices: ['asc', 'desc'],
        queryName: 'sort_order',
      },
      {
        flags: '--page <value>',
        description: 'page number starting at 1',
        type: 'integer',
        defaultValue: 1,
      },
      {
        flags: '--size <value>',
        description: 'page rows (1-20)',
        type: 'integer',
        defaultValue: 20,
      },
    ],
    paging: 'page',
    window: 'none',
  },
  {
    id: 'special.auction-opportunity-dates',
    command: ['special', 'auction-opportunity-dates'],
    description: 'Query available auction opportunity dates',
    endpoint: '/api/a-share/special-data/auction-opportunity-dates',
    method: 'GET',
    inputSchema: z.object({}).strict(),
    outputSchema: objectOutput,
    options: [],
    paging: 'none',
    window: 'none',
  },
  {
    id: 'ipo.a-share-calendar',
    command: ['ipo', 'a-share-calendar'],
    description: 'Query A-share IPO dates and subscription status',
    endpoint: '/api/a-share/ipo/calendar-list',
    method: 'GET',
    inputSchema: z
      .object({
        market: z.enum(['sh_sz', 'bj']),
        status: z.enum(['upcoming', 'subscribable', 'awaiting_listing']),
      })
      .strict(),
    outputSchema: objectOutput,
    options: [
      {
        flags: '--market <value>',
        description: 'market',
        type: 'string',
        choices: ['sh_sz', 'bj'],
        required: true,
      },
      {
        flags: '--status <value>',
        description: 'status',
        type: 'string',
        choices: ['upcoming', 'subscribable', 'awaiting_listing'],
        required: true,
      },
    ],
    paging: 'none',
    window: 'none',
  },
  {
    id: 'ipo.hk-applications',
    command: ['ipo', 'hk-applications'],
    description: 'Query a page of Hong Kong IPO applications',
    endpoint: '/api/hk-share/ipo/application-list',
    method: 'GET',
    inputSchema: z.object({ page: z.number().int().min(1).max(2147483647).default(1) }).strict(),
    outputSchema: objectOutput,
    options: [
      {
        flags: '--page <value>',
        description: 'page number starting at 1',
        type: 'integer',
        defaultValue: 1,
      },
    ],
    paging: 'page',
    window: 'none',
  },
  {
    id: 'ipo.hk-calendar',
    command: ['ipo', 'hk-calendar'],
    description: 'Query Hong Kong IPO subscription and listing dates',
    endpoint: '/api/hk-share/ipo/calendar-list',
    method: 'GET',
    inputSchema: z.object({ status: z.enum(['subscribable', 'awaiting_listing']) }).strict(),
    outputSchema: objectOutput,
    options: [
      {
        flags: '--status <value>',
        description: 'status',
        type: 'string',
        choices: ['subscribable', 'awaiting_listing'],
        required: true,
      },
    ],
    paging: 'none',
    window: 'none',
  },
  {
    id: 'ipo.hk-issue-detail',
    command: ['ipo', 'hk-issue-detail'],
    description: 'Query Hong Kong IPO issue price range and lot size',
    endpoint: '/api/hk-share/ipo/issue-detail',
    method: 'GET',
    inputSchema: z
      .object({
        issueCode: z
          .string()
          .min(1)
          .max(32)
          .refine((value) => value.trim().length > 0),
      })
      .strict(),
    outputSchema: objectOutput,
    options: [
      {
        flags: '--issue-code <value>',
        description: 'issue record identifier from the Hong Kong IPO calendar (1-32 characters)',
        type: 'string',
        required: true,
        queryName: 'issue_code',
      },
    ],
    paging: 'none',
    window: 'none',
  },
  {
    id: 'news.article-detail',
    command: ['news', 'article-detail'],
    description: 'Query news article detail',
    endpoint: '/api/news/article/detail',
    method: 'GET',
    inputSchema: z
      .object({
        clientType: newsSegment.refine(
          (value) => ['WEB', 'WEB_ENCRYPTED', 'PC', 'PC_LIST'].includes(value.toUpperCase()),
          'expected WEB, WEB_ENCRYPTED, PC or PC_LIST',
        ),
        encodedSeq: newsSegment,
      })
      .strict(),
    outputSchema: newsArticleOutput,
    options: [
      {
        flags: '--client-type <value>',
        description: 'WEB, WEB_ENCRYPTED, PC or PC_LIST (case insensitive)',
        type: 'string',
        required: true,
        queryName: 'client_type',
      },
      {
        flags: '--encoded-seq <value>',
        description: 'opaque article identifier',
        type: 'string',
        required: true,
        queryName: 'encoded_seq',
      },
    ],
    paging: 'none',
    window: 'none',
  },
  {
    id: 'news.flash-list',
    command: ['news', 'flash-list'],
    description: 'Query a page of news flashes',
    endpoint: '/api/news/flash/list',
    method: 'GET',
    inputSchema: z.object({ tagId: z.number().int().safe(), seq: newsSeq }).strict(),
    outputSchema: newsFlashOutput,
    options: [
      {
        flags: '--tag-id <value>',
        description: 'flash channel identifier',
        type: 'integer',
        required: true,
        queryName: 'tag_id',
      },
      {
        flags: '--seq <value>',
        description: 'decimal string cursor; first page 0',
        type: 'string',
        required: true,
      },
    ],
    paging: 'none',
    window: 'none',
  },
  {
    id: 'news.flash-refresh',
    command: ['news', 'flash-refresh'],
    description: 'Refresh news flashes from a supplied cursor',
    endpoint: '/api/news/flash/refresh',
    method: 'GET',
    inputSchema: z
      .object({
        tagId: z.number().int().safe(),
        seq: newsSeq,
        createTimeMs: z
          .number()
          .int()
          .safe()
          .refine((value) => value % 1000 === 0, 'milliseconds must be divisible by 1000'),
      })
      .strict(),
    outputSchema: newsFlashOutput,
    options: [
      {
        flags: '--tag-id <value>',
        description: 'flash channel identifier',
        type: 'integer',
        required: true,
        queryName: 'tag_id',
      },
      {
        flags: '--seq <value>',
        description: 'decimal string cursor',
        type: 'string',
        required: true,
      },
      {
        flags: '--create-time-ms <value>',
        description: 'known creation time in milliseconds, divisible by 1000',
        type: 'integer',
        required: true,
        queryName: 'create_time_ms',
      },
    ],
    paging: 'none',
    window: 'none',
  },
  {
    id: 'news.notice-detail',
    command: ['news', 'notice-detail'],
    description: 'Query announcement detail and interpretation',
    endpoint: '/api/news/notice/detail',
    method: 'GET',
    inputSchema: z.object({ seq: newsSegment }).strict(),
    outputSchema: newsNoticeOutput,
    options: [
      {
        flags: '--seq <value>',
        description: 'opaque announcement identifier',
        type: 'string',
        required: true,
      },
    ],
    paging: 'none',
    window: 'none',
  },
  {
    id: 'news.topic-hot-list',
    command: ['news', 'topic-hot-list'],
    description: 'Query hot news topics',
    endpoint: '/api/news/topic/hot-list',
    method: 'GET',
    inputSchema: z
      .object({
        tabId: z.number().int().safe(),
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(10).default(10),
        importantOnly: z.boolean().default(false),
      })
      .strict(),
    outputSchema: newsTopicOutput,
    options: [
      {
        flags: '--tab-id <value>',
        description: 'topic tab identifier',
        type: 'integer',
        required: true,
        queryName: 'tab_id',
      },
      {
        flags: '--cursor <value>',
        description: 'opaque next_cursor from previous response',
        type: 'string',
      },
      {
        flags: '--limit <value>',
        description: 'page rows (1-10)',
        type: 'integer',
        defaultValue: 10,
      },
      {
        flags: '--important-only <value>',
        description: 'only important topics',
        type: 'boolean',
        defaultValue: false,
        queryName: 'important_only',
      },
    ],
    paging: 'offset',
    pagingEnd: 'has-more',
    window: 'none',
  },
  {
    id: 'news.anomaly-analysis',
    command: ['news', 'anomaly-analysis'],
    description: 'Query anomaly interpretations over a date range',
    endpoint: '/api/news/anomaly/analysis',
    method: 'GET',
    inputSchema: z
      .object({ beginDate: calendarDate, endDate: calendarDate, thscode: nonblank.optional() })
      .strict()
      .refine((value) => value.beginDate <= value.endDate, 'begin_date must not exceed end_date'),
    outputSchema: newsAnomalyOutput,
    options: [
      {
        flags: '--begin-date <value>',
        description: 'start date YYYY-MM-DD',
        type: 'string',
        required: true,
        queryName: 'begin_date',
      },
      {
        flags: '--end-date <value>',
        description: 'end date YYYY-MM-DD',
        type: 'string',
        required: true,
        queryName: 'end_date',
      },
      {
        flags: '--thscode <value>',
        description: 'optional code in the format required by this endpoint',
        type: 'string',
      },
    ],
    paging: 'none',
    window: 'none',
  },
  {
    id: 'news.stock-timeline-list',
    command: ['news', 'stock-timeline-list'],
    description: 'Query stock timeline news',
    endpoint: '/api/news/stock/timeline-list',
    method: 'GET',
    inputSchema: z
      .object({
        thscode: z.string().regex(/^[0-9a-z]+\.[a-z]+$/iu),
        offset: nonblank,
        size: z.number().int().min(1).max(100).optional(),
      })
      .strict(),
    outputSchema: newsTimelineOutput,
    options: [
      {
        flags: '--thscode <value>',
        description: 'single complete thscode',
        type: 'string',
        required: true,
      },
      {
        flags: '--offset <value>',
        description: 'first for initial page; then response offset',
        type: 'string',
        required: true,
      },
      {
        flags: '--size <value>',
        description: 'page rows (1-100); omitted by default',
        type: 'integer',
      },
    ],
    paging: 'offset',
    pagingEnd: 'has-more',
    window: 'none',
  },
] as const;

function calendarYearsAfter(milliseconds: number, years: number): number {
  const date = new Date(milliseconds + 8 * 3600_000);
  const month = date.getUTCMonth();
  date.setUTCFullYear(date.getUTCFullYear() + years);
  if (date.getUTCMonth() !== month) date.setUTCDate(0);
  return date.getTime() - 8 * 3600_000;
}

function recentIndexLowerBound(): number {
  const today = new Date(Date.now() + 8 * 3600_000);
  today.setUTCHours(0, 0, 0, 0);
  return calendarYearsAfter(today.getTime() - 8 * 3600_000, -5);
}

function batchCodes(maximum: number) {
  return z
    .string()
    .superRefine((value, context) => {
      const tokens = value.split(',');
      if (tokens.length > maximum)
        context.addIssue({
          code: 'custom',
          message: `thscodes accepts at most ${maximum} raw tokens`,
        });
      if (tokens.some((token) => !/^[A-Z0-9]+\.[A-Z0-9]+$/iu.test(token.trim())))
        context.addIssue({ code: 'custom', message: 'expected comma-separated complete thscodes' });
    })
    .transform((value) =>
      [...new Set(value.split(',').map((token) => token.trim().toUpperCase()))].join(','),
    );
}

const batchGroups = z.array(
  z
    .object({
      thscode: z.string(),
      timestamp: z.number().int().nullable(),
      item: z.array(resultRecord),
    })
    .strict(),
);
const batchHistoryOutput = z
  .object({
    interval: z.enum(['1d', '1w', '1mo']),
    adjust: z.enum(['none', 'forward', 'backward']).nullable(),
    item: batchGroups,
  })
  .strict();
const batchFinancialOutput = z.object({ item: batchGroups }).strict();

const batchHistoryFields = {
  thscodes: batchCodes(10),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
};

function batchHistoryInput(kind: 'market' | 'index' | 'fund') {
  return z
    .object({
      ...batchHistoryFields,
      interval: (kind === 'market' ? z.enum(['1d', '1w', '1mo']) : z.literal('1d')).default('1d'),
      ...(kind === 'market'
        ? { adjust: z.enum(['none', 'forward', 'backward']).default('forward') }
        : {}),
    })
    .strict()
    .superRefine((value, context) => {
      if (value.endMs < value.startMs)
        context.addIssue({ code: 'custom', message: 'end-ms must be >= start-ms' });
      if (kind === 'index') {
        if (value.startMs < recentIndexLowerBound())
          context.addIssue({
            code: 'custom',
            message: 'index history is available for the recent five calendar years',
          });
      } else if (value.endMs > calendarYearsAfter(value.startMs, kind === 'market' ? 10 : 5)) {
        context.addIssue({
          code: 'custom',
          message: `history window must not exceed ${kind === 'market' ? 10 : 5} calendar years`,
        });
      }
    });
}

const batchFinancialInput = z
  .object({
    thscodes: batchCodes(10),
    period: z.enum(['annual', 'quarterly']).default('annual'),
    limit: z.number().int().min(1).max(20).optional(),
    startMs: z.number().int().nonnegative().optional(),
    endMs: z.number().int().nonnegative().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const { thscodes, ...shared } = value;
    const parsed = financialInput.safeParse({ ...shared, thscode: thscodes.split(',')[0] });
    // Asset membership is resolved by the server and reported per requested code.
    const sharedIssues = parsed.success
      ? []
      : parsed.error.issues.filter((issue) => issue.path[0] !== 'thscode');
    for (const issue of sharedIssues)
      context.addIssue({ code: 'custom', message: issue.message, path: issue.path });
    if (
      value.startMs !== undefined &&
      value.endMs !== undefined &&
      value.endMs > calendarYearsAfter(value.startMs, 10)
    )
      context.addIssue({
        code: 'custom',
        message: 'financials window must not exceed ten calendar years',
      });
  });

const batchDefinitions = [
  ['market.history', batchHistoryInput('market')],
  ['index.history', batchHistoryInput('index')],
  ['fund.history', batchHistoryInput('fund')],
  ['financials.income', batchFinancialInput],
  ['financials.balance-sheet', batchFinancialInput],
  ['financials.cash-flow', batchFinancialInput],
] as const;

export const remoteCapabilities: readonly RemoteCapabilityDescriptor[] = [
  ...baseRemoteCapabilities,
  ...batchDefinitions.map(([id, inputSchema]): RemoteCapabilityDescriptor => {
    const original = baseRemoteCapabilities.find((capability) => capability.id === id)!;
    const options = original.options.map((option) =>
      option.flags.startsWith('--thscode ')
        ? {
            flags: '--thscodes <codes>',
            description: 'comma-separated complete thscodes; raw token limit applies',
            type: 'string' as const,
            required: true,
          }
        : option,
    );
    if (id === 'market.history' || id === 'index.history')
      options.push({
        flags: '--interval <interval>',
        description: 'bar interval',
        type: 'string',
        choices: id === 'market.history' ? ['1d', '1w', '1mo'] : ['1d'],
        defaultValue: '1d',
      });
    return {
      ...original,
      id: `${id}-batch`,
      command: [original.command[0], `${original.command[1]}-batch`],
      description: `${original.description} for multiple thscodes`,
      endpoint: `${original.endpoint}-batch`,
      inputSchema,
      outputSchema: id.includes('history') ? batchHistoryOutput : batchFinancialOutput,
      options,
    };
  }),
];
