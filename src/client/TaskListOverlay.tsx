/**
 * 全屏任务列表覆盖层：侧边栏收起时由 rail 按钮触发；
 * 也可在展开态作为查看入口（未来扩展）。展示完整 DSH TASKS + SYSTEM TASKS 列表，
 * 每行可点击进入 DetailOverlay 编辑，右上角"新建"按钮进入编辑（新增）。
 * @module dsh-cron-panel/client/TaskListOverlay
 */

import { useCallback, useEffect, useState } from 'react'
import type { CronEntry } from '../core/types.ts'
import type { CronPanelApi } from './api.ts'
import { useT } from './i18n.ts'

const OVERLAY_STYLE = `
.dsh-cron-list-overlay { position:fixed; inset:0; z-index:1200;
  background:rgba(0,0,0,0.55); display:flex; align-items:center; justify-content:center;
  backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px); }
.dsh-cron-list { width:min(640px, calc(100vw - 48px)); max-height:calc(100vh - 80px);
  display:flex; flex-direction:column; overflow:hidden;
  background:#ffffff; border:1px solid rgba(128,128,128,0.2);
  border-radius:14px; box-shadow:0 20px 48px rgba(0,0,0,0.25);
  --cp-bg:#ffffff; --cp-fg:#0f172a; --cp-muted:#64748b; --cp-border:#e2e8f0;
  --cp-accent:#2563eb; --cp-danger:#ef4444; --cp-row-hover:rgba(15,23,42,0.05);
}
[data-theme="dark"] .dsh-cron-list,
[data-ds-dark-theme] .dsh-cron-list,
html.dark .dsh-cron-list {
  background:#1e293b !important;
  --cp-bg:#1e293b; --cp-fg:#f8fafc; --cp-muted:#94a3b8;
  --cp-border:#334155; --cp-accent:#3b82f6; --cp-danger:#f87171;
  --cp-row-hover:rgba(255,255,255,0.06);
  box-shadow:0 25px 50px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) .dsh-cron-list {
    background:#1e293b !important;
    --cp-bg:#1e293b; --cp-fg:#f8fafc; --cp-fg:#f8fafc; --cp-muted:#94a3b8;
    --cp-border:#334155; --cp-accent:#3b82f6; --cp-danger:#f87171;
    --cp-row-hover:rgba(255,255,255,0.06);
  }
}
.dsh-cron-list * { box-sizing:border-box; }
.dsh-cron-list-head { display:flex; align-items:center; gap:8px; padding:14px 18px;
  border-bottom:1px solid var(--cp-border); }
.dsh-cron-list-head .title { flex:1; font-weight:600; font-size:15px; color:var(--cp-fg); }
.dsh-cron-list-head .count { font-size:12px; color:var(--cp-muted); }
.dsh-cron-list-actions { display:flex; align-items:center; gap:6px; }
.dsh-cron-list-btn { border:1px solid var(--cp-border); background:transparent; color:var(--cp-fg);
  border-radius:8px; padding:5px 12px; font-size:12px; cursor:pointer; display:inline-flex;
  align-items:center; gap:5px; }
.dsh-cron-list-btn:hover { background:var(--cp-row-hover); }
.dsh-cron-list-btn.primary { border-color:var(--cp-accent); background:var(--cp-accent); color:#fff; }
.dsh-cron-list-btn.primary:hover { filter:brightness(1.08); }
.dsh-cron-list-close { border:none; background:transparent; color:var(--cp-muted); cursor:pointer;
  width:28px; height:28px; border-radius:8px; display:flex; align-items:center;
  justify-content:center; padding:0; font-size:15px; }
.dsh-cron-list-close:hover { background:var(--cp-row-hover); color:var(--cp-fg); }
.dsh-cron-list-body { overflow:auto; padding:6px 0; }
.dsh-cron-list-section { padding:12px 18px 4px; color:var(--cp-muted); font-size:11px;
  font-weight:600; text-transform:uppercase; letter-spacing:.4px; }
.dsh-cron-list-row { display:flex; align-items:center; gap:10px; padding:8px 18px;
  cursor:pointer; font-size:13px; color:var(--cp-fg); border-radius:6px;
  margin:1px 8px; }
.dsh-cron-list-row:hover { background:var(--cp-row-hover); }
.dsh-cron-list-row.off { opacity:0.55; }
.dsh-cron-list-dot { width:8px; height:8px; border-radius:50%; flex:none; }
.dsh-cron-list-dot.ok { background:#16a34a; }
.dsh-cron-list-dot.err { background:#ef4444; }
.dsh-cron-list-dot.none { background:var(--cp-muted); opacity:0.4; }
.dsh-cron-list-expr { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12px;
  color:var(--cp-accent); white-space:nowrap; flex:none; min-width:90px; }
.dsh-cron-list-cmd { flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  color:var(--cp-fg); }
.dsh-cron-list-del { color:var(--cp-danger); font-size:13px; flex:none; }
.dsh-cron-list-empty { padding:24px; text-align:center; color:var(--cp-muted); font-size:13px; }
.dsh-cron-list-foot { padding:10px 18px; border-top:1px solid var(--cp-border); font-size:11px;
  color:var(--cp-muted); text-align:center; }
`

let styleInjected = false
function ensureListStyle(): void {
  if (styleInjected) return
  styleInjected = true
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-cron-panel-list'
  tag.textContent = OVERLAY_STYLE
  document.head.appendChild(tag)
}

interface TaskListOverlayProps {
  api: CronPanelApi
  /** 列表刷新计数：保存/删除后由宿主自增触发刷新。 */
  revision: number
  onClose: () => void
  /** 点击某条任务 → 触发编辑弹窗（同时关闭列表弹窗）。 */
  onEdit: (entry: CronEntry) => void
  /** 点击"新建"按钮 → 触发编辑弹窗的新增模式（同时关闭列表弹窗）。 */
  onCreate: () => void
}

export function TaskListOverlay(props: TaskListOverlayProps): React.ReactElement {
  const { api, revision, onClose, onEdit, onCreate } = props
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
    ensureListStyle()
    void reload()
  }, [reload, revision])

  // ESC 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const managed = entries?.filter((e) => e.managed) ?? []
  const system = entries?.filter((e) => !e.managed) ?? []
  const total = entries?.length ?? 0

  return (
    <div className="dsh-cron-list-overlay" onClick={onClose}>
      <div className="dsh-cron-list" onClick={(e) => e.stopPropagation()}>
        <div className="dsh-cron-list-head">
          <span className="title">{t('panel.title')}</span>
          <span className="count">{total}</span>
          <div className="dsh-cron-list-actions">
            <button type="button" className="dsh-cron-list-btn primary" onClick={onCreate}>
              <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor"
                strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
                <path d="M8 3v10M3 8h10" />
              </svg>
              {t('panel.add')}
            </button>
            <button type="button" className="dsh-cron-list-close" onClick={onClose} title={t('panel.close')}
              aria-label={t('panel.close')}>
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor"
                strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </div>
        </div>

        <div className="dsh-cron-list-body">
          {error !== null ? (
            <div className="dsh-cron-list-empty" style={{ color: 'var(--cp-danger)' }}>{error}</div>
          ) : null}

          {entries === null ? (
            <div className="dsh-cron-list-empty">{t('list.loading')}</div>
          ) : entries.length === 0 ? (
            <div className="dsh-cron-list-empty">{t('list.empty')}</div>
          ) : (
            <>
              <div className="dsh-cron-list-section">{t('section.dsh')}</div>
              {managed.length === 0
                ? <div className="dsh-cron-list-empty">{t('empty.managed')}</div>
                : managed.map((entry) => <ListRow key={entry.id} entry={entry} onEdit={onEdit} />)}

              <div className="dsh-cron-list-section">{t('section.system')}</div>
              {system.length === 0
                ? <div className="dsh-cron-list-empty">{t('empty.system')}</div>
                : system.map((entry) => <ListRow key={entry.id} entry={entry} onEdit={onEdit} />)}
            </>
          )}
        </div>

        <div className="dsh-cron-list-foot">{t('list.hint')}</div>
      </div>
    </div>
  )
}

function ListRow(props: { entry: CronEntry; onEdit: (entry: CronEntry) => void }): React.ReactElement {
  const { entry, onEdit } = props
  const st = entry.lastStatus ?? 'none'
  return (
    <div className={`dsh-cron-list-row${entry.enabled ? '' : ' off'}`} onClick={() => onEdit(entry)}
      title={entry.description || entry.command}>
      <span className={`dsh-cron-list-dot ${st}`} />
      <span className="dsh-cron-list-expr">{entry.expr}</span>
      <span className="dsh-cron-list-cmd">{entry.command}</span>
      {!entry.enabled ? <span className="dsh-cron-list-del">✕</span> : null}
    </div>
  )
}