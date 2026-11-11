const adapter = new URL('./fixtures/isolate-auth.mjs', import.meta.url).href;
process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS ?? ''} --import="${adapter}"`;
process.env.HITHINK_FINANCE_NO_UPDATE_CHECK = '1';
process.env.HITHINK_FINANCE_NO_WORKER = '1';
