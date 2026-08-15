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
.dsh-cron-panel { --cp-fg:#24292f; --cp-muted:#6e7781; --cp-border:rgba(128,128,128,0.25);
  --cp-hover:rgba(0,0,0,0.05); --cp-bg:#f6f8fa; --cp-accent:#1976d2; --cp-danger:#cf222e;
  color:var(--cp-fg); font-size:12px; }
[data-ds-dark-theme] .dsh-cron-panel { --cp-fg:#d1d9e0; --cp-muted:#9198a1;
  --cp-border:rgba(255,255,255,0.14); --cp-hover:rgba(255,255,255,0.07);
  --cp-bg:#161b22; --cp-accent:#58a6ff; --cp-danger:#f85149; }
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
.dsh-cron-item .expr { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:11px;
  color:var(--cp-accent); white-space:nowrap; flex:none; }
.dsh-cron-item .cmd { flex:1; min-width:0; white-space:nowrap; overflow:hidden;
  text-overflow:ellipsis; color:var(--cp-fg); }
.dsh-cron-item .off { opacity:0.5; text-decoration:line-through; }
.dsh-cron-item .del { color:var(--cp-danger); }
.dsh-cron-hint { padding:6px 10px 8px; color:var(--cp-muted); line-height:1.6; }
.dsh-cron-hint b { color:var(--cp-fg); }
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
  onOpen: (entry: CronEntry | null) => void
}): React.ReactElement {
  const { api, revision, onOpen } = props
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

  const managed = entries?.filter((e) => e.managed) ?? []
  const system = entries?.filter((e) => !e.managed) ?? []

  return (
    <div className={`dsh-cron-panel${collapsed ? ' collapsed' : ''}`}>
      <div className="dsh-cron-head">
        <span>{t('panel.title')}</span>
        <span className="spacer" />
        {!collapsed ? (
          <button type="button" className="dsh-cron-add" title={t('panel.add')}
            onClick={() => onOpen(null)}>
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
            managed.map((entry) => <CronRow key={entry.id} entry={entry} onOpen={onOpen} />)
          )}

          <div className="dsh-cron-section">{t('section.system')}</div>
          {system.length === 0 ? (
            <div className="dsh-cron-empty">{t('empty.system')}</div>
          ) : (
            system.map((entry) => <CronRow key={entry.id} entry={entry} onOpen={onOpen} />)
          )}
        </>
      ) : null}
    </div>
  )
}

/** 单条任务行。 */
function CronRow(props: { entry: CronEntry; onOpen: (entry: CronEntry) => void }): React.ReactElement {
  const { entry, onOpen } = props
  return (
    <div className="dsh-cron-item" title={entry.description || entry.command}
      onClick={() => onOpen(entry)}>
      <span className={`expr${entry.enabled ? '' : ' off'}`}>{entry.expr}</span>
      <span className={`cmd${entry.enabled ? '' : ' off'}`}>{entry.command}</span>
      {!entry.enabled ? <span className="del">✕</span> : null}
    </div>
  )
}
