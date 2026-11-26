import { createElement as h, useEffect, useLayoutEffect, useSyncExternalStore } from 'react';
import { accountNamespace, accountRemote } from '../host/account-remote.js';
import { workbenchNamespace, workbenchRemote } from '../host/workbench-remote.js';
import { AccountSettings, FinancePanelIcon } from './account.js';
import { FinanceToolView } from './result.js';
import { financeTurnKey, financeTurnResults, renderToolName } from './turn-tail.js';
import { createPageDrafts, FinanceWorkbench } from './workbench.js';
import { createWorkbenchComposer } from './workbench-composer.js';
import { readOfficialBoard } from './official-workbench/remote.js';
import css from './styles.css';
import workbenchCss from './workbench.css';

export const inject = ['slots', 'remote'];
const panelId = 'hithink-finance';
const mainPanelId = 'hithink-finance-workspace';
const tabId = 'hithink-finance-workbench';
const tabTitle = () => '同花顺金融数据';
const legacyRoutes = new Map([
  ['hithink-finance-account', { view: 'settings' }],
  ['hithink-finance-docs', { view: 'docs' }],
]);

function bindRemote(ctx, mounted, contribution, namespace, unwrap = false) {
  return Object.fromEntries(contribution.descriptors.map(({ method }) => [
    method,
    async (...args) => {
      if (!await mounted) return { ok: false };
      const remote = ctx.get(`remote.${namespace}`);
      if (!remote) return { ok: false };
      if (method === 'liveCase') {
        const [input, signal] = args;
        return readOfficialBoard(() => remote.liveCase(input), signal);
      }
      const response = remote[method](...args);
      if (!unwrap) return response;
      const reply = await response;
      return reply?.ok === true ? reply.value : { ok: false };
    },
  ]));
}

export function apply(ctx) {
  const boardRevisions = new Map();
  const boardListeners = new Set();
  let revision = { library: 0, storage: 0 };
  const boards = {
    subscribe(listener) {
      boardListeners.add(listener);
      return () => boardListeners.delete(listener);
    },
    getSnapshot: () => revision,
    changed(board, storageChanged = false) {
      if (board) {
        const key = JSON.stringify([board.directory, board.id]);
        if (board.revision <= (boardRevisions.get(key) ?? 0)) return;
        boardRevisions.set(key, board.revision);
      }
      revision = { library: revision.library + 1, storage: revision.storage + (storageChanged ? 1 : 0) };
      for (const listener of boardListeners) listener();
    },
  };
  ctx.effect(() => {
    const style = document.createElement('style');
    style.textContent = css + workbenchCss;
    document.head.append(style);
    return () => style.remove();
  }, 'hithink-finance: styles');
  for (const key of ['hithink_finance', renderToolName]) {
    ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ name: 'tool.call.toolview', key }, FinanceToolView));
  }
  ctx.inject(['uiConversation', 'slots'], (conversation) => {
    conversation.uiConversation.events.register(financeTurnResults);
    conversation.slots.inject('conversation.chat.turnTail', () => conversation.slots.register({
      name: 'conversation.chat.turnTail', id: financeTurnKey,
    }, function TurnFinanceResults({ turn, seq, ...props }) {
      const results = turn.data.get(financeTurnKey)?.filter((result) => result.seq <= seq);
      const board = results?.findLast((result) => result.board)?.board;
      useEffect(() => { if (board) boards.changed(board); }, [board]);
      const cards = results?.filter((result) => result.meta);
      return cards?.length ? h('div', { className: 'hf-turn-tail' }, cards.map((block) =>
        h(FinanceToolView, { ...props, key: block.seq, phase: 'result', block }))) : null;
    }));
  });
  const mounted = ctx.remote.$mount({
    package: accountRemote.package,
    descriptors: [...accountRemote.descriptors, ...workbenchRemote.descriptors],
  }).then(() => true, () => false);
  const account = bindRemote(ctx, mounted, accountRemote, accountNamespace);
  const workbench = bindRemote(ctx, mounted, workbenchRemote, workbenchNamespace, true);
  const drafts = createPageDrafts();
  ctx.inject(['layout', 'sidebarRight', 'sidebarRightTabs', 'uiWorkspace', 'sessions', 'workspaces', 'conversation'], (ui) => {
    const right = ui.sidebarRight;
    const composer = createWorkbenchComposer(ui);
    const panelInfo = ui.layout.panelInfo;
    const workspaceList = ui.workspaces.list;
    const subscribePanel = panelInfo.subscribe.bind(panelInfo);
    const getPanel = () => panelInfo.getSnapshot().activePanelId;
    const subscribeWorkspaces = workspaceList.subscribe.bind(workspaceList);
    const getWorkspaces = workspaceList.getSnapshot.bind(workspaceList);
    const desktop = 'dshDesktop' in globalThis || globalThis.location?.protocol === 'dsh-app:';
    const pickDirectory = desktop && typeof ui.uiWorkspace.pickDirectory === 'function'
      ? () => ui.uiWorkspace.pickDirectory() : undefined;
    ui.effect(() => composer.dispose);
    let pending = null;
    let dockRoute;
    let mainRoute;
    let openingSession;
    const listeners = new Set();
    const subscribe = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };
    const notify = () => { for (const listener of listeners) listener(); };
    const openMain = (route) => {
      mainRoute = route;
      ui.layout.selectPanel(mainPanelId);
    };
    const openRight = (route) => {
      ui.layout.selectPanel(null);
      pending = { route };
      notify();
    };
    const tabOptions = (route) => route && { params: { financeRoute: route } };

    // A sidebar row selects its matching main slot. Relay it before that slot paints.
    function WorkbenchLauncher() {
      useLayoutEffect(() => { openRight(); }, []);
      return null;
    }

    function DockOpener() {
      const intent = useSyncExternalStore(subscribe, () => pending);
      const session = useSyncExternalStore(right.mounted.subscribe, right.mounted.getSnapshot);
      const panel = useSyncExternalStore(subscribePanel, getPanel);
      const workspace = useSyncExternalStore(subscribeWorkspaces, getWorkspaces);
      useEffect(() => {
        const activePanel = getPanel();
        if (activePanel === panelId) return;
        if (activePanel != null && intent && intent === pending) {
          pending = null;
          notify();
        }
        if (!session) return;
        const active = right.active();
        const legacyRoute = legacyRoutes.get(active?.kind);
        const tabs = right.openTabs?.getSnapshot().filter((tab) => tab.sessionId === session)
          ?? (active ? [{ tabId: active.id, kind: active.kind }] : []);
        const currentTab = tabs.find((tab) => tab.kind === tabId && tab.tabId === active?.id)
          ?? tabs.find((tab) => tab.kind === tabId);
        const next = activePanel == null && intent === pending ? intent : null;
        const restoreOpen = Boolean(legacyRoute && right.isExpanded());
        if (next || restoreOpen) {
          const route = next?.route ?? legacyRoute;
          if (currentTab) {
            if (route) dockRoute = { session, tab: currentTab.tabId, route };
            if (!right.isExpanded()) right.toggleExpanded();
            right.focus(currentTab.tabId);
          } else {
            right.openTab(tabId, tabOptions(route));
          }
        }
        for (const tab of tabs) {
          if (legacyRoutes.has(tab.kind) || (tab.kind === tabId && tab !== currentTab)) right.close(tab.tabId);
        }
        if (intent && intent === pending) pending = null;
        if (intent || restoreOpen) notify();
      }, [intent, panel, session]);
      useEffect(() => {
        if (session || !intent || intent !== pending || openingSession
          || getPanel() != null) return;
        const recent = workspace.items.reduce((latest, item) => !latest || item.updatedAt > latest.updatedAt ? item : latest, undefined);
        openingSession = ui.sessions.create(recent ? { workspaceId: recent.workspaceId } : {}).then((id) => {
          if (pending && getPanel() == null && !right.mounted.getSnapshot()) {
            ui.uiWorkspace.openSession(id);
          }
        }).catch(() => {
          pending = null;
          notify();
        }).finally(() => { openingSession = undefined; });
      }, [intent, panel, session, workspace]);
      return null;
    }
    function MainWorkbench() {
      const revealReference = () => {
        if (right.active()?.kind === tabId && right.isExpanded()) right.toggleExpanded();
      };
      return h(FinanceWorkbench, { route: mainRoute, account, workbench, drafts, boards, pickDirectory, move: openRight,
        openComposer: (prompt) => composer.open(prompt),
        openReference: (board) => composer.reference(board, revealReference) });
    }
    function ComposerDraft({ sessionId }) {
      const intent = useSyncExternalStore(composer.subscribe, () => composer.focusFor(sessionId));
      useEffect(() => {
        if (!intent) return;
        const frame = requestAnimationFrame(() => composer.focus(intent));
        return () => cancelAnimationFrame(frame);
      }, [intent]);
      return composer.hasPrevious(sessionId) ? h('button', { type: 'button', className: 'hf-wb-draft-back',
        onClick: () => composer.returnToPrevious(sessionId) }, '返回原草稿') : null;
    }
    ui.slots.inject('shell.overlay', () => ui.slots.register({ name: 'shell.overlay', id: panelId }, DockOpener));
    ui.slots.inject('conversation.input.dock', () => ui.slots.register({ name: 'conversation.input.dock', id: panelId }, ComposerDraft));
    ui.effect(() => ui.sidebarRightTabs.register({
      id: tabId, kind: tabId, title: tabTitle, keepMounted: true,
    }));
    ui.slots.inject('sidebar.right.pane.tab', () => ui.slots.register({
      name: 'sidebar.right.pane.tab', key: tabId,
    }, function WorkbenchDock({ useTabInfo }) {
      const { tab, sidebar } = useTabInfo();
      const target = useSyncExternalStore(subscribe, () => tab.visible && dockRoute?.tab === tab.id
        && dockRoute.session === right.mounted.getSnapshot() ? dockRoute : undefined);
      const revealComposer = () => {
        if (sidebar.fullscreen && right.isExpanded() && right.active()?.id === tab.id) right.toggleExpanded();
      };
      return h(FinanceWorkbench, { route: tab.navigation.params?.financeRoute, navigationRevision: tab.navigation.revision,
        destination: target,
        account, workbench, drafts, boards, pickDirectory, move: openMain, openComposer: (prompt) => composer.open(prompt, revealComposer),
        openReference: (board) => composer.reference(board, revealComposer),
        dock: true, isVisible: tab.visible });
    }));
    ui.slots.inject('main', () => ui.slots.register({ name: 'main', key: panelId }, WorkbenchLauncher));
    ui.slots.inject('main', () => ui.slots.register({ name: 'main', key: mainPanelId }, MainWorkbench));
    ui.slots.inject('sidebar.panellist', () => ui.slots.register({
      name: 'sidebar.panellist', id: panelId, label: () => '同花顺金融数据',
    }, FinancePanelIcon));
    ui.slots.inject('plugins.bundle.config', () => ui.slots.register({
      name: 'plugins.bundle.config', key: '@hithink-tech/dsh-finance',
    }, () => h(AccountSettings, { open: (view) => openRight({ view }) })));
  });
}
