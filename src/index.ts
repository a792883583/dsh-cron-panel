/**
 * dsh-cron-panel — 宿主侧部分：用户 crontab 的读取与改写服务及其在共享
 * webserver 上的 /cron-panel/* HTTP 路由。浏览器侧部分（导出 "./client"）
 * 由同包的 dsh.client 声明通过 client-modules 提供。
 * @module dsh-cron-panel
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-subprocess'
import type {} from '@deepseek-ai/dsh-llm'
import { subprocessRunner } from './host/cron-service.ts'
import { registerCronPanelRoutes } from './host/routes.ts'

/** 所需服务：路由注册表与托管子进程接缝。llm 可选——缺失时自然语言解析回退本地正则。 */
export const inject = ['webServer', 'subprocess'] as const

/** 挂载 cron 服务及其路由。 */
export function apply(ctx: Context): void {
  const runner = subprocessRunner(ctx)
  // llm 为可选依赖：用 ctx.get 探测（strict=false，未注入时返回 undefined），
  // 直接读 ctx.llm 属性在未注入时会抛错并让 fiber 失败。
  const llm = ctx.get('llm') ?? null
  ctx.effect(() => registerCronPanelRoutes(ctx, runner, llm), 'dsh-cron-panel: /cron-panel routes')
}

/** Cordis plugin entry — named + default export so the loader always resolves it. */
export default { apply, inject }
