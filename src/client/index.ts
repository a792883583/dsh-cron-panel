/**
 * dsh-cron-panel — 浏览器半区：把「定时任务」面板挂到侧边栏工作区
 * （regionArea）与设置（footArea）之间，管理用户 crontab；点击任务或
 * 新增按钮打开全屏详情覆盖层（编辑 / 保存 / 删除）。所有接线失败均记录
 * 日志而不抛出——插件 apply 抛错会导致整个 shell 启动失败。
 * @module dsh-cron-panel/client
 */

import { createElement, Fragment, useCallback, useState, useSyncExternalStore } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { CronEntry } from '../core/types.ts'
import { CronPanelApi } from './api.ts'
import { DetailOverlay } from './DetailOverlay.tsx'
import { TaskListOverlay } from './TaskListOverlay.tsx'
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

/**
 * 定位右栏内 sidebarCol 底部的 footArea 节点（用于在其前插入本面板）。
 *
 * 之前用 `[class*="footArea"]` 全局抓，结果抓到的是 **左栏** workbench sidebar
 * 自己的 footArea（x=12，hHd-Xa_footArea），用户看到按钮跑到了左下角——
 * 那不是「定时任务按钮跑到了右侧栏」，而是面板被错误地塞进了官方左侧栏。
 *
 * 正确路径：右栏 frame 是 `[class*="_frame"][data-rightbar-collapsed]`，
 * 右栏 sidebarCol 在 frame 内部；workbench sidebar 把 hHd-Xa_footArea 渲染到
 * sidebarCol 内部（仍是同一个右栏里的元素）。我们把选择器限定在 frame 范围内。
 */
const RIGHTBAR_FRAME_SELECTOR = '[class*="_frame"][data-rightbar-collapsed]'
const FOOT_AREA_SELECTOR = '[class*="footArea"]'

/**
 * 侧边栏收起状态 store。
 *
 * 官方在右侧栏容器（`*_frame`）上维护 `data-sidebar-collapsed` 属性：
 * 展开时为 `rightbarCollapsed=true`，收起后追加 `sidebarCollapsed=true`，
 * 列宽从 280px 缩到 56px。面板注入在侧边栏列内，收起后必须切换为紧凑
 * 图标轨，否则完整面板会被挤成一团。
 */
let sidebarCollapsed = false
const sidebarListeners = new Set<() => void>()
function setSidebarCollapsed(value: boolean): void {
  if (sidebarCollapsed === value) return
  sidebarCollapsed = value
  for (const fn of sidebarListeners) fn()
}
function subscribeSidebarCollapsed(fn: () => void): () => void {
  sidebarListeners.add(fn)
  return () => sidebarListeners.delete(fn)
}
function getSidebarCollapsed(): boolean {
  return sidebarCollapsed
}

/** 面板根组件：管理列表刷新计数与详情覆盖层。 */
function CronApp(props: { api: CronPanelApi }): React.ReactElement {
  const { api } = props
  // undefined = 编辑/详情覆盖层关闭；null = 新增；CronEntry = 编辑。
  const [editOpen, setEditOpen] = useState<CronEntry | null | undefined>(undefined)
  const [revision, setRevision] = useState(0)
  // 任务列表全屏弹窗（侧边栏收起时通过 rail 按钮打开）。
  const [listOpen, setListOpen] = useState(false)
  // 侧边栏收起状态（跟随官方 data-sidebar-collapsed）
  const sidebarCollapsed = useSyncExternalStore(subscribeSidebarCollapsed, getSidebarCollapsed)

  const bump = useCallback((): void => setRevision((v) => v + 1), [])
  const onEdit = useCallback((e: CronEntry | null): void => setEditOpen(e), [])
  const onOpenList = useCallback((): void => setListOpen(true), [])
  const onCloseList = useCallback((): void => setListOpen(false), [])
  const onCreate = useCallback((): void => { setListOpen(false); setEditOpen(null) }, [])

  return createElement(
    Fragment,
    null,
    createElement(CronPanel, {
      api, revision, sidebarCollapsed,
      onEdit,
      onOpenList,
    }),
    listOpen
      ? createElement(TaskListOverlay, {
          api, revision,
          onClose: onCloseList,
          onEdit: (e: CronEntry) => { setListOpen(false); setEditOpen(e) },
          onCreate,
        })
      : null,
    editOpen !== undefined
      ? createElement(DetailOverlay, { api, entry: editOpen, onClose: () => setEditOpen(undefined), onSaved: bump })
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

    // 监听官方侧边栏容器的收起状态（data-sidebar-collapsed 属性变化）。
    let observer: MutationObserver | null = null
    const attachObserver = (): void => {
      if (observer !== null) return
      // 找右栏 frame（不是左栏）
      const frame = document.querySelector<HTMLElement>(RIGHTBAR_FRAME_SELECTOR)
      if (frame === null) return
      observer = new MutationObserver(() => {
        setSidebarCollapsed(frame.dataset.sidebarCollapsed === 'true')
      })
      observer.observe(frame, { attributes: true, attributeFilter: ['data-sidebar-collapsed'] })
      setSidebarCollapsed(frame.dataset.sidebarCollapsed === 'true')
    }
    attachObserver()
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
        attachObserver()
        // 必须先限定到右栏 frame 内——否则会抓到左栏的 footArea。
        const frame = document.querySelector<HTMLElement>(RIGHTBAR_FRAME_SELECTOR)
        const foot = frame !== null ? frame.querySelector<HTMLElement>(FOOT_AREA_SELECTOR) : null
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
      observer?.disconnect()
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
