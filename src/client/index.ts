/**
 * dsh-cron-panel — 浏览器半区：把「定时任务」面板挂到侧边栏工作区
 * （regionArea）与设置（footArea）之间，管理用户 crontab；点击任务或
 * 新增按钮打开全屏详情覆盖层（编辑 / 保存 / 删除）。所有接线失败均记录
 * 日志而不抛出——插件 apply 抛错会导致整个 shell 启动失败。
 * @module dsh-cron-panel/client
 */

import { createElement, Fragment, useCallback, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { CronEntry } from '../core/types.ts'
import { CronPanelApi } from './api.ts'
import { DetailOverlay } from './DetailOverlay.tsx'
import { initI18n } from './i18n.ts'
import { CronPanel } from './Panel.tsx'

/** 注入的 client runtime 结构面孔。 */
interface CronClientContext {
  effect(fn: () => (() => void) | void, name: string): void
  locale: {
    getLocale(): { active: string }
    subscribe(fn: () => void): () => void
  }
}

export const inject = ['locale']

/** 侧边栏设置区（footArea）CSS-module 哈希片段（*contains* 选择器）。 */
const FOOT_AREA_SELECTOR = '[class*="footArea"]'

/** 面板根组件：管理列表刷新计数与详情覆盖层。 */
function CronApp(props: { api: CronPanelApi }): React.ReactElement {
  const { api } = props
  // undefined = 覆盖层关闭；null = 新增；CronEntry = 编辑。
  const [open, setOpen] = useState<CronEntry | null | undefined>(undefined)
  const [revision, setRevision] = useState(0)

  const bump = useCallback((): void => setRevision((v) => v + 1), [])

  return createElement(
    Fragment,
    null,
    createElement(CronPanel, { api, revision, onOpen: setOpen }),
    open !== undefined
      ? createElement(DetailOverlay, { api, entry: open, onClose: () => setOpen(undefined), onSaved: bump })
      : null,
  )
}

/** Apply the browser half. */
export function apply(ctx: CronClientContext): void {
  try {
    initI18n(ctx.locale)
  } catch (error) {
    console.error('dsh-cron-panel: i18n init failed (falling back to Chinese)', error)
  }

  ctx.effect(() => {
    const host = document.createElement('div')
    host.dataset.cronPanelHost = ''
    const root: Root = createRoot(host)
    const api = new CronPanelApi()
    let disposed = false

    const render = (): void => {
      if (disposed) return
      root.render(createElement(CronApp, { api }))
    }

    // 轮询等待侧边栏挂载，把面板插到设置区（footArea）之前——
    // 即工作区（regionArea）下方、设置上方。挂载成功后停止轮询，
    // 由低频兜底定时器负责侧边栏重建时的重新挂载（避免常驻 rAF 开销）。
    let raf = 0
    let polling = true
    const poll = (): void => {
      if (disposed || !polling) return
      if (!host.isConnected) {
        const foot = document.querySelector<HTMLElement>(FOOT_AREA_SELECTOR)
        if (foot !== null && foot.parentElement !== null) {
          foot.parentElement.insertBefore(host, foot)
          render()
          polling = false
          console.debug('[dsh-cron-panel] mounted before footArea')
          return
        }
      } else {
        polling = false
        return
      }
      raf = requestAnimationFrame(poll)
    }
    raf = requestAnimationFrame(poll)

    // 兜底：侧边栏重建后重新挂载（每 5 秒一次轻量检查）。
    const fallback = window.setInterval(() => {
      if (disposed) return
      if (!host.isConnected) {
        polling = true
        raf = requestAnimationFrame(poll)
      }
    }, 5000)

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      window.clearInterval(fallback)
      try {
        root.unmount()
      } catch {
        /* 忽略 */
      }
      host.remove()
    }
  }, 'dsh-cron-panel: mount')
}

/** Cordis plugin entry — named + default export so the loader always resolves it. */
export default { apply, inject }
