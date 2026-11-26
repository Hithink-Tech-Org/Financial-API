import { createElement as h, useCallback, useEffect, useRef, useState } from 'react';

const actions = {
  init: '初始化数据库',
  sync: '立即同步',
  validate: '质量校验',
  repair: '重建复权',
};
const databaseStates = { ready: '可用', uninitialized: '待初始化', busy: '其他进程使用中', unavailable: '暂不可用' };
const time = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'medium', timeStyle: 'short' });
const failure = '无法读取本地数据状态，请重试。';

function description(receipt) {
  if (!receipt) return '暂无记录';
  const when = time.format(receipt.finishedAt);
  const result = receipt.ok
    ? receipt.quality?.passed === false ? `发现 ${receipt.quality.issues} 项质量问题` : '成功'
    : receipt.error?.message ?? '失败';
  const trigger = receipt.trigger === 'scheduled' ? '定时' : '手动';
  return `${when} · ${trigger} · ${result}`;
}

export function DataSettings({ localData, isVisible, Button }) {
  const [state, setState] = useState({});
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmRepair, setConfirmRepair] = useState(null);
  const [actionMessage, setActionMessage] = useState({});
  const latest = useRef(0);
  const refresh = useCallback(async () => {
    const sequence = ++latest.current;
    const reply = await localData.status().catch(() => undefined);
    if (sequence !== latest.current) return;
    if (reply?.ok) setState({ data: reply.data });
    else setState((previous) => ({ ...previous, error: reply?.error?.message ?? failure }));
  }, [localData]);

  const data = state.data;
  const running = data?.running;
  useEffect(() => {
    if (!isVisible) return;
    void refresh();
    const interval = setInterval(() => { void refresh(); }, running ? 2_000 : 15_000);
    window.addEventListener('focus', refresh);
    return () => {
      latest.current += 1;
      clearInterval(interval);
      window.removeEventListener('focus', refresh);
    };
  }, [isVisible, refresh, running]);

  async function mutate(operation, success) {
    if (busy) return;
    setBusy(true);
    setActionMessage({});
    const reply = await operation().catch(() => undefined);
    if (reply?.ok) {
      if (success === '定时设置已保存。') setDraft(null);
      setActionMessage({ success });
    } else {
      setActionMessage({ error: reply?.error?.message ?? '操作失败，请重试。' });
    }
    await refresh();
    setBusy(false);
  }

  function start(action, databasePath = data.databasePath) {
    setConfirmRepair(null);
    return mutate(() => localData.run(action, databasePath), `已启动${actions[action]}。`);
  }

  if (!data) return h('div', { className: 'hf-wb-storage' },
    h('p', { className: state.error ? 'hf-wb-error' : 'hf-wb-quiet', role: state.error ? 'alert' : 'status' },
      state.error ?? '正在读取本地数据…'),
    state.error && h(Button, { onClick: refresh }, '重试'));

  const schedule = draft ?? data.schedule;
  const ready = data.databaseState === 'ready';
  const disabled = busy || Boolean(running);
  return h('div', { className: 'hf-wb-storage' },
    h('dl', { className: 'hf-wb-directory' },
      h('dt', null, 'CLI 数据库'), h('dd', null, h('code', null, data.databasePath)),
      h('dt', null, '状态'), h('dd', null, running ? `${actions[running]}进行中` : databaseStates[data.databaseState]),
      h('dt', null, '数据截至'), h('dd', null, data.latestDate ?? '暂无日线'),
      h('dt', null, '最近一次同步'), h('dd', null, description(data.lastSync)),
      h('dt', null, '最近成功同步'), h('dd', null, data.lastSuccessfulSync ? time.format(data.lastSuccessfulSync.finishedAt) : '暂无记录')),
    h('div', { className: 'hf-wb-actions' },
      data.databaseState === 'uninitialized' && h(Button, { primary: true, disabled, onClick: () => { void start('init'); } }, actions.init),
      h(Button, { primary: ready, disabled: disabled || !ready, onClick: () => { void start('sync'); } }, actions.sync),
      h(Button, { disabled: disabled || !ready, onClick: () => { void start('validate'); } }, actions.validate),
      h(Button, { disabled: disabled || !ready, onClick: () => setConfirmRepair(data.databasePath) }, actions.repair),
      h(Button, { disabled: busy, onClick: refresh }, '刷新状态')),
    confirmRepair && h('div', { className: 'hf-wb-storage-result' },
      h('p', null, '重新计算此数据库的复权因子 ', h('code', null, confirmRepair)),
      h('div', { className: 'hf-wb-actions' },
        h(Button, { primary: true, disabled, onClick: () => { void start('repair', confirmRepair); } }, '确认重建'),
        h(Button, { onClick: () => setConfirmRepair(null) }, '取消'))),
    data.lastAction && data.lastAction.action !== 'sync' && h('p', { className: 'hf-wb-quiet', role: 'status' },
      actions[data.lastAction.action], ' · ', description(data.lastAction)),
    h('form', { className: 'hf-wb-form', onSubmit: (event) => {
      event.preventDefault();
      void mutate(() => localData.setSchedule(schedule), '定时设置已保存。');
    } },
    h('div', { className: 'hf-wb-migration' },
      h('label', null, h('input', { type: 'checkbox', checked: schedule.enabled, disabled: busy,
        onChange: (event) => setDraft({ ...schedule, enabled: event.target.checked }) }), '启用每日定时同步')),
    h('label', { className: 'hf-wb-field' }, '执行时间（北京时间）',
      h('input', { type: 'time', value: schedule.time, required: true, disabled: busy || !schedule.enabled,
        onChange: (event) => setDraft({ ...schedule, time: event.target.value }) })),
    h('p', { className: 'hf-wb-quiet' }, 'DSH 运行且账号可用时执行。错过计划后可手动同步。'),
    h('div', { className: 'hf-wb-actions' }, h(Button, { type: 'submit',
      disabled: busy || !schedule.time || (schedule.enabled === data.schedule.enabled && schedule.time === data.schedule.time) }, '保存定时设置'))),
    (state.error || actionMessage.error || data.statusWarning) && h('p', { className: 'hf-wb-error', role: 'alert' },
      actionMessage.error ?? state.error ?? data.statusWarning),
    actionMessage.success && h('p', { className: 'hf-wb-quiet', role: 'status' }, actionMessage.success));
}
