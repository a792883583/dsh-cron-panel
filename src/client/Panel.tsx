/**
 * 侧边栏「定时任务」面板：位于工作区（regionArea）与设置（footArea）之间。
 * 分区展示 DSH 定时任务（引导）与系统定时任务（crontab），标题右侧为新增按钮，
 * 点击任务打开全屏详情（见 DetailOverlay）。
 * @module dsh-cron-panel/client/Panel
 */

import { useCallback, useEffect, useState } from 'react'
import type { CronEntry } from '../core/types.ts'
import type { CronPanelApi } from './api.ts'
import { useT } from './i18n.ts'

const STYLE = `
.dsh-cron-panel {
  --cp-fg: currentColor;
  --cp-muted: rgba(140, 149, 159, 0.9);
  --cp-border: rgba(128, 128, 128, 0.2);
  --cp-hover: rgba(128, 128, 128, 0.1);
  --cp-bg: transparent;
  --cp-accent: #2563eb;
  --cp-danger: #ef4444;
  color: var(--cp-fg);
  font-size: 12px;
}
[data-theme="dark"] .dsh-cron-panel,
[data-ds-dark-theme] .dsh-cron-panel,
html.dark .dsh-cron-panel {
  --cp-muted: #94a3b8;
  --cp-border: rgba(255, 255, 255, 0.12);
  --cp-hover: rgba(255, 255, 255, 0.08);
  --cp-accent: #3b82f6;
  --cp-danger: #f87171;
}
.dsh-cron-panel * { box-sizing:border-box; }
.dsh-cron-head { display:flex; align-items:center; gap:4px; padding:8px 10px 6px;
  font-weight:600; font-size:12px; }
.dsh-cron-head .spacer { flex:1; }
.dsh-cron-add { border:none; background:transparent; color:var(--cp-muted); cursor:pointer;
  width:22px; height:22px; border-radius:6px; display:flex; align-items:center;
  justify-content:center; padding:0; }
.dsh-cron-add:hover { background:var(--cp-hover); color:var(--cp-accent); }

.dsh-cron-section { padding:6px 10px 2px; color:var(--cp-muted); font-size:11px;
  font-weight:600; text-transform:uppercase; letter-spacing:0.4px; }
.dsh-cron-item { display:flex; align-items:center; gap:6px; padding:5px 10px; cursor:pointer;
  border-radius:6px; margin:0 4px; }
.dsh-cron-item:hover { background:var(--cp-hover); }
.dsh-cron-status-dot { width:6px; height:6px; border-radius:50%; flex:none; }
.dsh-cron-status-dot.ok { background:#2ea043; }
.dsh-cron-status-dot.err { background:#cf222e; }
.dsh-cron-status-dot.none { background:var(--cp-muted); opacity:0.4; }
.dsh-cron-item .expr { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:11px;
  color:var(--cp-accent); white-space:nowrap; flex:none; }
.dsh-cron-item .cmd { flex:1; min-width:0; white-space:nowrap; overflow:hidden;
  text-overflow:ellipsis; color:var(--cp-fg); }
.dsh-cron-platform-icon { font-size:10px; opacity:0.85; flex:none; margin-left:2px; }
.dsh-cron-item .off { opacity:0.5; text-decoration:line-through; }
.dsh-cron-item .del { color:var(--cp-danger); }
.dsh-cron-hint { padding:6px 10px 8px; color:var(--cp-muted); line-height:1.6; }
.dsh-cron-hint b { color:var(--cp-fg); }
/* 侧边栏收起时的紧凑图标轨 */
/* 对齐官方侧栏图标尺寸 36×36、间距 48px、x=10：减少与上方图标的视觉断裂 */
/* rail 入口按钮：**跟随主题**的一套变量，浅色/深色各自协调。
   浅色：极淡的中性底 + 深色图标 + 细边框（像官方图标的"轻卡片"）
   深色：半透明白底 + 浅色图标 + 半透明边框
   悬停时都用该主题的强调色描边/着色，保持可发现性但不刺眼。 */
.dsh-cron-rail { display:flex; align-items:center; justify-content:center;
  padding:6px 0; width:36px; margin:0 auto; }
.dsh-cron-rail-btn {
  --rail-bg: rgba(15, 23, 42, 0.05);
  --rail-bg-hover: rgba(37, 99, 235, 0.10);
  --rail-fg: #24292f;
  --rail-fg-hover: #1d4ed8;
  --rail-border: rgba(15, 23, 42, 0.12);
  --rail-border-hover: rgba(37, 99, 235, 0.45);
  position:relative; border:1px solid var(--rail-border);
  background:var(--rail-bg); color:var(--rail-fg);
  width:36px; height:36px; border-radius:8px; display:flex; align-items:center; justify-content:center;
  cursor:pointer; padding:0; transition:background .12s, color .12s, border-color .12s; }
.dsh-cron-rail-btn:hover { background:var(--rail-bg-hover); color:var(--rail-fg-hover);
  border-color:var(--rail-border-hover); }
.dsh-cron-rail-btn:active { transform:scale(0.96); }
/* 深色主题：三种官方暗色标记 + 系统偏好 */
[data-theme="dark"] .dsh-cron-rail-btn,
[data-ds-dark-theme] .dsh-cron-rail-btn,
html.dark .dsh-cron-rail-btn {
  --rail-bg: rgba(255, 255, 255, 0.07);
  --rail-bg-hover: rgba(96, 165, 250, 0.18);
  --rail-fg: #e6edf3;
  --rail-fg-hover: #93c5fd;
  --rail-border: rgba(255, 255, 255, 0.14);
  --rail-border-hover: rgba(147, 197, 253, 0.45);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .dsh-cron-rail-btn {
    --rail-bg: rgba(255, 255, 255, 0.07);
    --rail-bg-hover: rgba(96, 165, 250, 0.18);
    --rail-fg: #e6edf3;
    --rail-fg-hover: #93c5fd;
    --rail-border: rgba(255, 255, 255, 0.14);
    --rail-border-hover: rgba(147, 197, 253, 0.45);
  }
}
.dsh-cron-rail-btn:hover { background:var(--cp-hover); color:var(--cp-accent); }
.dsh-cron-rail-badge { position:absolute; top:-3px; right:-3px; min-width:14px; height:14px;
  border-radius:7px; background:#ef4444; color:#fff; font-size:9px; font-weight:700;
  display:flex; align-items:center; justify-content:center; padding:0 3px; box-sizing:border-box;
  border:2px solid var(--cp-rail-ring, #ffffff); }
[data-theme="dark"] .dsh-cron-rail-badge,
[data-ds-dark-theme] .dsh-cron-rail-badge,
html.dark .dsh-cron-rail-badge { --cp-rail-ring: #1b1f27; }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .dsh-cron-rail-badge { --cp-rail-ring: #1b1f27; }
}
.dsh-cron-empty { padding:4px 10px 8px; color:var(--cp-muted); }
`

let styleInjected = false
function ensureStyle(): void {
  if (styleInjected) return
  styleInjected = true
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-cron-panel'
  tag.textContent = STYLE
  document.head.appendChild(tag)
}

/** 面板 props。 */
export function CronPanel(props: {
  api: CronPanelApi
  /** 变化计数：详情保存/删除后由宿主自增触发刷新。 */
  revision: number
  /** 侧边栏是否已收起（官方 data-sidebar-collapsed）。 */
  sidebarCollapsed: boolean
  /** 打开单条任务的编辑/详情弹窗（entry=null 表示新增）。 */
  onEdit: (entry: CronEntry | null) => void
  /** 打开任务列表全屏弹窗。 */
  onOpenList: () => void
}): React.ReactElement {
  const { api, revision, sidebarCollapsed, onEdit, onOpenList } = props
  const t = useT()
  const [entries, setEntries] = useState<CronEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async (): Promise<void> => {
    const result = await api.list()
    if (result.ok) {
      setEntries(result.value.entries)
      setError(null)
    } else {
      setError(result.error.message)
    }
  }, [api])

  useEffect(() => {
    void reload()
  }, [reload, revision])

  ensureStyle()
  // 收起状态：模块折叠成一条小标题栏，让出中间区域；状态持久化。
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('dsh-cron-panel.collapsed') === '1'
    } catch {
      return false
    }
  })
  const toggleCollapsed = (): void => {
    setCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem('dsh-cron-panel.collapsed', next ? '1' : '0')
      } catch {
        /* 忽略 */
      }
      return next
    })
  }

  const expandSidebar = (): void => {
    // 官方侧边栏切换按钮的 aria-label 恒定是 "Collapse right sidebar / 收起侧边栏"
    // （收起与展开共用同一按钮，靠点击切换，不会变成 Expand）。语言无关的选择：
    // 找 frame 容器附近、class 含 iconButton 且 label 含 collapse/收起 的按钮。
    // 实测 `P3OORG_iconButton`（w=28 小按钮）就是它。
    const btn = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((b) => {
      const label = b.getAttribute('aria-label') ?? b.title ?? ''
      const cls = b.className.toString()
      if (!/collapse|收起|sidebar/i.test(label)) return false
      return /iconbutton|icon/i.test(cls) || b.getBoundingClientRect().width < 40
    })
    if (btn !== undefined) btn.click()
  }

  const managed = entries?.filter((e) => e.managed) ?? []
  const system = entries?.filter((e) => !e.managed) ?? []

  // 侧边栏收起：只渲染一个 36×36 图标按钮，点击打开**任务列表全屏弹窗**，
  // 在弹窗里看完整 DSH + 系统任务列表。弹窗的"新建"按钮可触发新增表单。
  if (sidebarCollapsed) {
    const activeCount = managed.length
    return (
      <div className="dsh-cron-panel dsh-cron-rail" title={t('rail.title')}>
        <button type="button" className="dsh-cron-rail-btn" onClick={onOpenList}
          aria-label={t('rail.title')}>
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor"
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="8" cy="8" r="5.6" />
            <path d="M8 4.8V8l2.4 1.6" />
          </svg>
          {activeCount > 0 ? <span className="dsh-cron-rail-badge">{activeCount}</span> : null}
        </button>
      </div>
    )
  }

  return (
    <div className={`dsh-cron-panel${collapsed ? ' collapsed' : ''}`}>
      <div className="dsh-cron-head">
        <span>{t('panel.title')}</span>
        <span className="spacer" />
        {!collapsed ? (
          <button type="button" className="dsh-cron-add" title={t('panel.add')}
            onClick={() => onEdit(null)}>
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor"
              strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
              <path d="M8 3v10M3 8h10" />
            </svg>
          </button>
        ) : null}
        <button type="button" className="dsh-cron-add" title={collapsed ? t('panel.expand') : t('panel.collapse')}
          onClick={toggleCollapsed}>
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor"
            strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {collapsed ? <path d="M4 10l4-4 4 4" /> : <path d="M4 6l4 4 4-4" />}
          </svg>
        </button>
      </div>

      {!collapsed ? (
        <>
          {error ? <div className="dsh-cron-empty" style={{ color: 'var(--cp-danger)' }}>{error}</div> : null}

          <div className="dsh-cron-section">{t('section.dsh')}</div>
          {managed.length === 0 ? (
            <div className="dsh-cron-hint">
              <b>{t('dsh.hint.title')}</b>：{t('dsh.hint.body')}
              <div style={{ opacity: 0.75, marginTop: 4 }}>{t('dsh.hint.pending')}</div>
            </div>
          ) : (
            managed.map((entry) => <CronRow key={entry.id} entry={entry} onEdit={onEdit} />)
          )}

          <div className="dsh-cron-section">{t('section.system')}</div>
          {system.length === 0 ? (
            <div className="dsh-cron-empty">{t('empty.system')}</div>
          ) : (
            system.map((entry) => <CronRow key={entry.id} entry={entry} onEdit={onEdit} />)
          )}
        </>
      ) : null}
    </div>
  )
}

const PLATFORM_EMOJI: Record<string, string> = {
  telegram: '✈️',
  discord: '🎮',
  'wecom-aibot': '🤖',
  email: '📧',
}

/** 单条任务行。 */
function CronRow(props: { entry: CronEntry; onEdit: (entry: CronEntry) => void }): React.ReactElement {
  const { entry, onEdit } = props
  const st = entry.lastStatus ?? 'none'
  const icon = entry.notify?.platform ? PLATFORM_EMOJI[entry.notify.platform] ?? '🔔' : null
  const tooltip = [
    entry.description || entry.command,
    entry.retries ? `重试: ${entry.retries}次 / ${entry.retryDelaySec}s` : null,
    entry.notify ? `通知: ${entry.notify.platform} -> ${entry.notify.target}` : null,
  ].filter(Boolean).join('\n')

  return (
    <div className="dsh-cron-item" title={tooltip}
      onClick={() => onEdit(entry)}>
      <span className={`dsh-cron-status-dot ${st}`} />
      <span className={`expr${entry.enabled ? '' : ' off'}`}>{entry.expr}</span>
      <span className={`cmd${entry.enabled ? '' : ' off'}`}>{entry.command}</span>
      {icon ? <span className="dsh-cron-platform-icon" title={`已绑定 ${entry.notify?.platform} 通知`}>{icon}</span> : null}
      {!entry.enabled ? <span className="del">✕</span> : null}
    </div>
  )
}
