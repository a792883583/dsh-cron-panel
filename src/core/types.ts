/** host 与 client 共享的类型定义。 */

/** 一条定时任务。 */
export interface CronEntry {
  /** 本插件管理的条目为生成 id；系统条目为 `sys-<行号>`。 */
  id: string
  /** 描述（管理条目来自标记行）。 */
  description: string
  /** 5 字段 cron 表达式。 */
  expr: string
  /** 要执行的命令。 */
  command: string
  /** 是否启用（禁用的调度行带前导 #）。 */
  enabled: boolean
  /** 是否由本插件管理（带标记行）。 */
  managed: boolean
  /** 在 crontab 文本中的行号（标记行/调度行）。 */
  lines: number[]
}

/** crontab 解析视图。 */
export interface CronView {
  entries: CronEntry[]
  /** 原始行（写回时保留注释与环境变量等）。 */
  raw: string[]
}

/** 通用操作结果。 */
export interface OpResult {
  output: string
}
