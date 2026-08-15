/**
 * dsh-cron-panel — 宿主侧部分：用户 crontab 的读取与改写服务及其在共享
 * webserver 上的 /cron-panel/* HTTP 路由。浏览器侧部分（导出 "./client"）
 * 由同包的 dsh.client 声明通过 client-modules 提供。
 * @module dsh-cron-panel
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-subprocess'
import { subprocessRunner } from './host/cron-service.ts'
import { registerCronPanelRoutes } from './host/routes.ts'

/** 所需服务：路由注册表与托管子进程接缝。 */
export const inject = ['webServer', 'subprocess']

/** 挂载 cron 服务及其路由。 */
export function apply(ctx: Context): void {
  const runner = subprocessRunner(ctx)
  ctx.effect(() => registerCronPanelRoutes(ctx, runner), 'dsh-cron-panel: /cron-panel routes')
}

/** Cordis plugin entry — named + default export so the loader always resolves it. */
export default { apply, inject }
