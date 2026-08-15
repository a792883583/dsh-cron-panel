/**
 * 全屏详情覆盖层：覆盖对话区域，右上角关闭；支持新增（entry 为空）与编辑
 * （保存 / 删除）。表单含常用 cron 预设 + 自定义表达式 + 启用开关。
 * @module dsh-cron-panel/client/DetailOverlay
 */

import { useCallback, useEffect, useState } from 'react'
import type { CronEntry } from '../core/types.ts'
import type { CronPanelApi } from './api.ts'
import { useT } from './i18n.ts'
import { parseNaturalLanguage } from './nl-cron.ts'

const OVERLAY_STYLE = `
.dsh-cron-overlay { position:fixed; inset:0; z-index:1200; background:rgba(0,0,0,0.45);
  display:flex; align-items:center; justify-content:center; }
.dsh-cron-card { width:min(560px, calc(100vw - 48px)); max-height:calc(100vh - 64px); overflow:auto;
  background:var(--cp-bg, #ffffff); border:1px solid var(--cp-border, rgba(128,128,128,0.25));
  border-radius:12px; box-shadow:0 16px 48px rgba(0,0,0,0.3); padding:18px 20px;
  --cp-fg:#24292f; --cp-muted:#6e7781; --cp-border:rgba(128,128,128,0.25);
  --cp-accent:#1976d2; --cp-danger:#cf222e; --cp-field:#ffffff; }
[data-ds-dark-theme] .dsh-cron-card { --cp-fg:#d1d9e0; --cp-muted:#9198a1;
  --cp-border:rgba(255,255,255,0.14); --cp-accent:#58a6ff; --cp-danger:#f85149;
  --cp-field:#21262d; }
.dsh-cron-card * { box-sizing:border-box; }
.dsh-cron-card-head { display:flex; align-items:center; gap:8px; margin-bottom:14px; }
.dsh-cron-card-head .title { flex:1; font-weight:600; font-size:14px; color:var(--cp-fg); }
.dsh-cron-close { border:none; background:transparent; color:var(--cp-muted); cursor:pointer;
  width:28px; height:28px; border-radius:8px; display:flex; align-items:center;
  justify-content:center; padding:0; }
.dsh-cron-close:hover { background:rgba(128,128,128,0.12); color:var(--cp-fg); }
.dsh-cron-field { margin-bottom:12px; }
.dsh-cron-field label { display:block; font-size:12px; color:var(--cp-muted); margin-bottom:4px; }
.dsh-cron-input { width:100%; padding:7px 10px; font-size:13px; color:var(--cp-fg);
  background:var(--cp-field); border:1px solid var(--cp-border); border-radius:8px; outline:none; }
.dsh-cron-input:focus { border-color:var(--cp-accent); }
.dsh-cron-input.mono { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }
.dsh-cron-hint { font-size:11px; color:var(--cp-muted); margin-top:4px; }
.dsh-cron-switch { display:flex; align-items:center; gap:8px; font-size:13px; color:var(--cp-fg);
  cursor:pointer; user-select:none; }
.dsh-cron-actions { display:flex; gap:8px; margin-top:16px; align-items:center; }
.dsh-cron-btn { border:1px solid var(--cp-border); background:transparent; color:var(--cp-fg);
  border-radius:8px; padding:7px 14px; font-size:13px; cursor:pointer; }
.dsh-cron-btn:hover { background:rgba(128,128,128,0.08); }
.dsh-cron-btn.primary { background:var(--cp-accent); border-color:var(--cp-accent); color:#fff; }
.dsh-cron-btn.danger { color:var(--cp-danger); }
.dsh-cron-btn:disabled { opacity:0.5; cursor:default; }
.dsh-cron-msg { flex:1; font-size:12px; color:var(--cp-muted); text-align:right;
  white-space:pre-wrap; word-break:break-all; }
.dsh-cron-logbox { max-height:180px; overflow:auto; border:1px solid var(--cp-border);
  border-radius:8px; background:var(--cp-field); margin-top:4px; }
.dsh-cron-log-pre { margin:0; padding:8px 10px; font-size:11px; line-height:1.5;
  color:var(--cp-fg); font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
  white-space:pre-wrap; word-break:break-all; }
.dsh-cron-log-empty { padding:10px; font-size:12px; color:var(--cp-muted); }
.dsh-cron-msg.err { color:var(--cp-danger); }
.dsh-cron-msg.ok { color:#1a7f37; }
`

const PRESETS: Record<string, string> = {
  everyMinute: '* * * * *',
  hourly: '0 * * * *',
  daily: '0 0 * * *',
  weekly: '0 0 * * 1',
  monthly: '0 0 1 * *',
}

let overlayStyleInjected = false
function ensureOverlayStyle(): void {
  if (overlayStyleInjected) return
  overlayStyleInjected = true
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-cron-panel-overlay'
  tag.textContent = OVERLAY_STYLE
  document.head.appendChild(tag)
}

/** 详情覆盖层。 */
export function DetailOverlay(props: {
  api: CronPanelApi
  /** 编辑对象；null 表示新增。 */
  entry: CronEntry | null
  onClose: () => void
  onSaved: () => void
}): React.ReactElement {
  const { api, entry, onClose, onSaved } = props
  const t = useT()
  const isNew = entry === null
  const [description, setDescription] = useState(entry?.description ?? '')
  const [expr, setExpr] = useState(entry?.expr ?? PRESETS.daily)
  const [command, setCommand] = useState(entry?.command ?? '')
  const [enabled, setEnabled] = useState(entry?.enabled ?? true)
  const [preset, setPreset] = useState('custom')
  const [nl, setNl] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; kind: 'ok' | 'err' } | null>(null)
  // 执行记录：{ path, lines }；null = 尚未加载。
  const [logs, setLogs] = useState<{ path: string | null; lines: string[] } | null>(null)
  const [logsBusy, setLogsBusy] = useState(false)

  // 自然语言实时解析：命中则自动填入表达式。
  const nlResult = nl.trim() === '' ? null : parseNaturalLanguage(nl)

  // 编辑模式打开时自动加载执行记录。
  const loadLogs = useCallback(async (): Promise<void> => {
    if (entry === null) return
    setLogsBusy(true)
    const result = await api.logs(entry)
    setLogsBusy(false)
    if (result.ok) setLogs(result.value)
  }, [api, entry])

  useEffect(() => {
    void loadLogs()
  }, [loadLogs])

  // ESC 关闭。
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  ensureOverlayStyle()

  const pickPreset = (key: string): void => {
    setPreset(key)
    if (key !== 'custom') setExpr(PRESETS[key])
  }

  const save = useCallback(async (): Promise<void> => {
    if (expr.trim() === '' || command.trim() === '') {
      setMessage({ text: t('err.invalid'), kind: 'err' })
      return
    }
    setBusy(true)
    setMessage(null)
    const input = { description: description.trim(), expr: expr.trim(), command: command.trim(), enabled }
    const result = entry === null
      ? await api.create(input)
      : await api.update(entry, input)
    setBusy(false)
    if (result.ok) {
      setMessage({ text: isNew ? t('msg.created') : t('msg.saved'), kind: 'ok' })
      onSaved()
      window.setTimeout(onClose, 350)
    } else {
      setMessage({ text: result.error.message, kind: 'err' })
    }
  }, [api, entry, description, expr, command, enabled, isNew, t, onSaved, onClose])

  const remove = useCallback(async (): Promise<void> => {
    if (entry === null) return
    if (!window.confirm(t('detail.delete.confirm'))) return
    setBusy(true)
    setMessage(null)
    const result = await api.delete(entry)
    setBusy(false)
    if (result.ok) {
      setMessage({ text: t('msg.deleted'), kind: 'ok' })
      onSaved()
      window.setTimeout(onClose, 350)
    } else {
      setMessage({ text: result.error.message, kind: 'err' })
    }
  }, [api, entry, t, onSaved, onClose])

  return (
    <div className="dsh-cron-overlay" onClick={onClose}>
      <div className="dsh-cron-card" onClick={(event) => event.stopPropagation()}>
        <div className="dsh-cron-card-head">
          <span className="title">{isNew ? t('detail.title.new') : t('detail.title.edit')}</span>
          <button type="button" className="dsh-cron-close" title={t('detail.close')}
            onClick={onClose}>
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor"
              strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </div>

        <div className="dsh-cron-field">
          <label>{t('detail.description')}</label>
          <input className="dsh-cron-input" value={description}
            placeholder={t('detail.description.placeholder')}
            onChange={(event) => setDescription(event.target.value)} />
        </div>

        <div className="dsh-cron-field">
          <label>{t('nl.label')}</label>
          <input className="dsh-cron-input" value={nl} placeholder={t('nl.placeholder')}
            onChange={(event) => {
              const value = event.target.value
              setNl(value)
              if (value.trim() !== '') {
                const parsed = parseNaturalLanguage(value)
                if (parsed !== null) {
                  setExpr(parsed)
                  setPreset('custom')
                }
              }
            }} />
          {nl.trim() !== '' ? (
            <div className="dsh-cron-hint" style={nlResult === null ? { color: 'var(--cp-danger)' } : undefined}>
              {nlResult === null ? t('nl.unrecognized') : `${t('nl.preview')}：${nlResult}`}
            </div>
          ) : null}
        </div>

        <div className="dsh-cron-field">
          <label>{t('detail.preset')}</label>
          <select className="dsh-cron-input" value={preset} onChange={(event) => pickPreset(event.target.value)}>
            <option value="custom">{t('preset.custom')}</option>
            <option value="everyMinute">{t('preset.everyMinute')}</option>
            <option value="hourly">{t('preset.hourly')}</option>
            <option value="daily">{t('preset.daily')}</option>
            <option value="weekly">{t('preset.weekly')}</option>
            <option value="monthly">{t('preset.monthly')}</option>
          </select>
        </div>

        <div className="dsh-cron-field">
          <label>{t('detail.expr')}</label>
          <input className="dsh-cron-input mono" value={expr} spellCheck={false}
            onChange={(event) => {
              setExpr(event.target.value)
              setPreset('custom')
            }} />
          <div className="dsh-cron-hint">{t('expr.hint')}</div>
        </div>

        <div className="dsh-cron-field">
          <label>{t('detail.command')}</label>
          <input className="dsh-cron-input mono" value={command} spellCheck={false}
            placeholder={t('detail.command.placeholder')}
            onChange={(event) => setCommand(event.target.value)} />
        </div>

        <div className="dsh-cron-field">
          <label className="dsh-cron-switch">
            <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
            {t('detail.enabled')}
          </label>
        </div>

        {!isNew ? (
          <div className="dsh-cron-field">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>{t('detail.logs')}</span>
              <span className="spacer" style={{ flex: 1 }} />
              <button type="button" className="dsh-cron-btn" disabled={logsBusy}
                onClick={() => void loadLogs()}
                style={{ padding: '2px 10px', fontSize: 11 }}>
                {t('detail.logs.refresh')}
              </button>
            </label>
            <div className="dsh-cron-logbox">
              {logsBusy && logs === null ? (
                <div className="dsh-cron-log-empty">…</div>
              ) : logs === null ? null : logs.path === null ? (
                <div className="dsh-cron-log-empty">
                  {entry?.managed ? t('detail.logs.empty.managed') : t('detail.logs.empty.system')}
                </div>
              ) : logs.lines.length === 0 ? (
                <div className="dsh-cron-log-empty">
                  {entry?.managed ? t('detail.logs.empty.managed') : ''}
                </div>
              ) : (
                <pre className="dsh-cron-log-pre">{logs.lines.slice().reverse().join('\n')}</pre>
              )}
            </div>
            {logs?.path !== null && logs?.path !== undefined ? (
              <div className="dsh-cron-hint" style={{ wordBreak: 'break-all' }}>{logs.path}</div>
            ) : null}
          </div>
        ) : null}

        <div className="dsh-cron-actions">
          <button type="button" className="dsh-cron-btn primary" disabled={busy}
            onClick={() => void save()}>{t('detail.save')}</button>
          {!isNew ? (
            <button type="button" className="dsh-cron-btn danger" disabled={busy}
              onClick={() => void remove()}>{t('detail.delete')}</button>
          ) : null}
          <button type="button" className="dsh-cron-btn" disabled={busy}
            onClick={onClose}>{t('detail.cancel')}</button>
          {message ? <span className={`dsh-cron-msg ${message.kind}`}>{message.text}</span> : null}
        </div>
      </div>
    </div>
  )
}
