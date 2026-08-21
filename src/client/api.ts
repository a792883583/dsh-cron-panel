/**
 * /cron-panel/* 路由的浏览器侧客户端。
 * @module dsh-cron-panel/client/api
 */

import type { CronEntry, CronView, OpResult } from '../core/types.ts'

export type Envelope<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string } }

/** 面向 host /cron-panel 路由的 JSON 客户端。 */
export class CronPanelApi {
  private async post<T>(path: string, payload: unknown): Promise<Envelope<T>> {
    let response: Response
    try {
      response = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload ?? {}),
      })
    } catch (error) {
      return { ok: false, error: { code: 'network', message: error instanceof Error ? error.message : 'network error' } }
    }
    try {
      return (await response.json()) as Envelope<T>
    } catch {
      return { ok: false, error: { code: 'internal', message: `bad response (${response.status})` } }
    }
  }

  list(): Promise<Envelope<CronView>> {
    return this.post('/cron-panel/list', {})
  }

  create(input: { description: string; expr: string; command: string; enabled: boolean; notify?: { platform: string; target: string } | null }): Promise<Envelope<OpResult>> {
    return this.post('/cron-panel/create', input)
  }

  update(entry: CronEntry, input: { description: string; expr: string; command: string; enabled: boolean; notify?: { platform: string; target: string } | null }): Promise<Envelope<OpResult>> {
    return this.post('/cron-panel/update', { ...entry, ...input })
  }

  delete(entry: CronEntry): Promise<Envelope<OpResult>> {
    return this.post('/cron-panel/delete', entry)
  }

  logs(entry: CronEntry): Promise<Envelope<{ path: string | null; lines: string[] }>> {
    return this.post('/cron-panel/logs', entry)
  }

  /** 下一次执行时间预览。 */
  next(expr: string): Promise<Envelope<{ next: string[] }>> {
    return this.post('/cron-panel/next', { expr })
  }
}
