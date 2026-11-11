/** Operational fields are opt-in diagnostics, not part of the normal sign-in result. */
export function authenticationResult(value: unknown, diagnostic: boolean): unknown {
  if (diagnostic || !value || typeof value !== 'object') return value;
  const result = { ...(value as Record<string, unknown>) };
  delete result.storage;
  return result;
}

/** Human-only view; connection and credential selection retain their machine fields. */
export function authenticationView(value: unknown, diagnostic = false): unknown {
  if (!value || typeof value !== 'object') return value;
  const data = value as Record<string, unknown>;
  if (typeof data.connected !== 'boolean') {
    if (data.removed === true)
      return { 结果: '已退出登录', 范围: data.all ? '全部凭据' : '当前认证方式' };
    return value;
  }
  const storage = data.storage as Record<string, unknown> | undefined;
  const credentials = data.credentials as Record<string, { state?: string }>;
  const states: Record<string, string> = {
    available: '可用',
    missing: '未保存',
    invalid: '已失效，请重新登录',
    login_required: '需要重新登录',
  };
  return {
    登录状态: data.connected ? '已连接' : '未连接',
    当前认证方式: data.active_method === 'oauth' ? 'OAuth（同花顺账号）' : 'API Key',
    OAuth凭据: states[credentials.oauth?.state ?? 'missing'] ?? credentials.oauth?.state,
    APIKey凭据: states[credentials['api-key']?.state ?? 'missing'] ?? credentials['api-key']?.state,
    授权任务: data.pending ? '等待浏览器确认' : '无',
    ...(diagnostic && storage ? { 诊断路径: storage.path, 诊断后端: storage.backend } : {}),
  };
}

export const chineseAuthenticationErrors: Record<string, [string, string]> = {
  AUTH_API_KEY_EMPTY: ['API Key 不能为空。', '重新输入有效 Key；非交互环境使用 --api-key-stdin。'],
  AUTH_HOME_UNAVAILABLE: ['无法确定当前系统用户的凭据目录。', '检查系统用户主目录配置后重试。'],
  AUTH_LEGACY_MISSING: ['指定的旧凭据条目不存在。', '检查 --legacy-profile 名称，或直接重新登录。'],
  AUTH_OAUTH_CONFIGURATION: [
    'OAuth 服务配置不完整或不符合要求。',
    '检查当前测试版本和对应服务环境配置。',
  ],
  AUTH_OAUTH_ENDPOINT: ['认证服务返回了未获信任的端点。', '停止本次授权，核对认证中心交付配置。'],
  AUTH_RUNTIME_UNSUPPORTED: [
    '当前 Node.js 版本不支持认证功能。',
    '使用 Node.js 22.13 以上的22版本，或24及以上版本。',
  ],
  AUTH_UNTRUSTED_DESTINATION: [
    '当前账号凭据不能发送到该数据服务地址。',
    '使用配置中获批的数据服务地址。',
  ],
  AUTH_WORKER_FAILED: ['本机授权任务无法启动。', '检查当前CLI安装和本机进程环境后重试。'],
  AUTH_LOGIN_REQUIRED: [
    '当前认证方式需要重新登录。',
    '运行 hithink-finance auth login，或用 auth use 选择已有凭据。',
  ],
  AUTH_MIGRATION_REQUIRED: [
    '旧凭据需要迁入共享文件。',
    '运行 hithink-finance auth migrate，然后重试。',
  ],
  AUTH_MIGRATION_AMBIGUOUS: [
    '检测到多份旧凭据。',
    '使用 auth migrate --legacy-profile <名称> 明确选择一次。',
  ],
  AUTH_STORAGE_PERMISSIONS: [
    '凭据目录或文件权限不符合要求。',
    '运行 hithink-finance doctor 检查，并修复当前用户的私有文件权限。',
  ],
  AUTH_STORAGE_CORRUPT: [
    '凭据文件格式损坏或无法解码。',
    '保留原文件，检查旧凭据迁移来源；不要直接覆盖。',
  ],
  AUTH_STORAGE_UNAVAILABLE: [
    '当前无法访问凭据文件。',
    '检查当前用户目录、文件权限及本机磁盘状态。',
  ],
  AUTH_STORAGE_BUSY: ['另一个认证操作尚未完成。', '等待当前登录或刷新结束，然后重试。'],
  AUTH_ROOT_MISSING: [
    '迁移所需的旧加密密钥不可用。',
    '恢复旧系统凭据库后运行 auth migrate；原文件尚未覆盖。',
  ],
  AUTH_CREDENTIAL_STORE_UNAVAILABLE: [
    '无法读取需要迁入的旧系统凭据。',
    '解锁旧系统凭据库后重试迁移。',
  ],
  AUTH_OAUTH_NOT_CONFIGURED: [
    '当前版本尚未配置可用的 OAuth 服务。',
    '检查所用版本及对应服务环境。',
  ],
  AUTH_IN_PROGRESS: [
    '已有账号授权任务正在进行。',
    '完成现有浏览器授权，或先运行 auth logout 再重试。',
  ],
  AUTH_CALLBACK_PORT_IN_USE: [
    '本机授权回调端口被占用。',
    '结束另一项登录任务后重试，不需要修改已登记回调地址。',
  ],
  AUTH_WORKER_TIMEOUT: [
    '授权任务未能及时就绪。',
    '检查本机文件和网络状态，然后重新运行 auth login。',
  ],
  AUTH_LOGIN_FAILED: ['本次账号授权未完成。', '重新运行 auth login，并使用新打开的授权页面。'],
  AUTH_LOGIN_CANCELLED: ['授权已取消或等待超时。', '需要登录时重新运行 auth login。'],
  AUTH_LOGIN_SUPERSEDED: [
    '本次授权已被较新的登录或退出操作替代。',
    '查看 auth status，以最新操作为准。',
  ],
  AUTH_REFRESH_REJECTED: [
    '登录凭据已失效，无法自动续期。',
    '运行 hithink-finance auth login 重新认证。',
  ],
  AUTH_REFRESH_UNCERTAIN: [
    '上次刷新结果未能确认。',
    '为保护凭据不重复使用旧刷新令牌，请重新登录。',
  ],
  AUTH_REFRESH_IN_PROGRESS: ['另一项请求正在刷新同一账号凭据。', '稍后重试，或查看 auth status。'],
  AUTH_REVOCATION_INCOMPLETE: [
    '本机已退出，远端撤销尚未确认。',
    '检查网络及认证中心状态；本机不会继续使用已清理的凭据。',
  ],
  AUTH_OAUTH_PROTOCOL: [
    '认证中心响应不符合本次授权合同。',
    '检查环境配置和实际授权范围，保留错误码供排查。',
  ],
};
