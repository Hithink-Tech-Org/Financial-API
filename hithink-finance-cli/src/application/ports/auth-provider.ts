/** 本次请求使用的 API Key 快照。 */
export interface ApiKeySession {
  method: 'api-key';
  /** 旧调用的诊断标识；当前全局会话固定为 default。 */
  profile: string;
  apiKey: string;
  source: 'explicit' | 'keyring' | 'file';
}

/** Fixed logical identity; token access can renew that same session. */
export type AuthSession =
  | ApiKeySession
  | {
      method: 'oauth';
      source: 'global';
      sessionId: string;
      apiOrigin: string;
      accessToken(): Promise<string>;
      refresh(rejectedToken: string): Promise<string>;
    };
