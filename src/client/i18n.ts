/**
 * 三语文案（中 / 英 / 西）。语言自动检测：优先跟随 DSH 平台语言（zh → 简体中文），
 * 其次浏览器语言（es → 西班牙语），其余默认简体中文。
 * @module dsh-cron-panel/client/i18n
 */

import { useSyncExternalStore } from 'react'

export type Lang = 'zh' | 'en' | 'es'

type Dict = Record<string, string>

const DICTS: Record<Lang, Dict> = {
  zh: {
    'panel.title': '定时任务',
    'panel.collapse': '收起',
    'panel.expand': '展开',
    'panel.add': '新增定时任务',
    'section.dsh': 'DSH 定时任务',
    'section.system': '系统定时任务',
    'empty.system': '暂无系统定时任务',
    'dsh.hint.title': '在对话中创建',
    'dsh.hint.body': '让助手创建定时提醒，例如：“每天上午 9 点提醒我站一会”。创建的提醒会自动出现在这里。',
    'dsh.hint.pending': '（当前会话的提醒列表将在后续版本展示）',
    'detail.title.new': '新增定时任务',
    'detail.title.edit': '定时任务详情',
    'detail.close': '关闭',
    'detail.description': '描述',
    'detail.description.placeholder': '例如：每天备份数据库',
    'detail.expr': 'Cron 表达式',
    'detail.preset': '常用预设',
    'detail.command': '命令',
    'detail.command.placeholder': '例如：/usr/local/bin/backup.sh',
    'detail.enabled': '启用',
    'detail.notify': '完成后通知（主动推送）',
    'detail.next': '接下来运行',
    'detail.notify.placeholder': '目标（telegram=chatId；discord=channelId；企微=userid/群ID；email=收件地址）',
    'detail.notify.hint': '任务执行结束后，结果推送到所选平台（需 dsh-message-gateway 已连接该平台；QQ 官方不支持主动推送）',
    'detail.save': '保存',
    'detail.delete': '删除',
    'detail.delete.confirm': '确认删除该定时任务？',
    'detail.cancel': '取消',
    'preset.custom': '自定义',
    'preset.everyMinute': '每分钟',
    'preset.hourly': '每小时',
    'preset.daily': '每天 00:00',
    'preset.weekly': '每周一 00:00',
    'preset.monthly': '每月 1 日 00:00',
    'msg.saved': '已保存',
    'msg.deleted': '已删除',
    'msg.created': '已创建',
    'err.invalid': '请填写 cron 表达式和命令',
    'err.load': '加载定时任务失败',
    'err.save': '保存失败',
    'expr.hint': '分 时 日 月 周，如 */5 * * * *',
    'nl.label': '自然语言（可选）',
    'nl.placeholder': '例如：每天上午 9 点运行备份',
    'nl.preview': '识别为',
    'nl.unrecognized': '未能识别，请手动填写表达式',
    'detail.logs': '执行记录',
    'detail.logs.refresh': '刷新',
    'detail.logs.empty.managed': '暂无执行记录，任务执行后自动记录',
    'detail.logs.empty.system': '该命令未重定向日志，无法查看执行记录',
  },
  en: {
    'panel.title': 'Scheduled tasks',
    'panel.collapse': 'Collapse',
    'panel.expand': 'Expand',
    'panel.add': 'New scheduled task',
    'section.dsh': 'DSH tasks',
    'section.system': 'System tasks',
    'empty.system': 'No system tasks',
    'dsh.hint.title': 'Create in chat',
    'dsh.hint.body': 'Ask the assistant to schedule a reminder, e.g. “remind me to stand up at 9am every day”. Reminders created this way appear here.',
    'dsh.hint.pending': '(Reminder list for the current session ships in a later version)',
    'detail.title.new': 'New scheduled task',
    'detail.title.edit': 'Task details',
    'detail.close': 'Close',
    'detail.description': 'Description',
    'detail.description.placeholder': 'e.g. daily database backup',
    'detail.expr': 'Cron expression',
    'detail.preset': 'Presets',
    'detail.command': 'Command',
    'detail.command.placeholder': 'e.g. /usr/local/bin/backup.sh',
    'detail.enabled': 'Enabled',
    'detail.notify': 'Notify on completion (push)',
    'detail.next': 'Next runs',
    'detail.notify.placeholder': 'Target (telegram=chatId; discord=channelId; wecom=userid/group id; email=address)',
    'detail.notify.hint': 'Push the task result to the selected platform after it finishes (requires dsh-message-gateway connected; QQ has no active push)',
    'detail.save': 'Save',
    'detail.delete': 'Delete',
    'detail.delete.confirm': 'Delete this scheduled task?',
    'detail.cancel': 'Cancel',
    'preset.custom': 'Custom',
    'preset.everyMinute': 'Every minute',
    'preset.hourly': 'Hourly',
    'preset.daily': 'Daily at 00:00',
    'preset.weekly': 'Weekly (Mon 00:00)',
    'preset.monthly': 'Monthly (1st, 00:00)',
    'msg.saved': 'Saved',
    'msg.deleted': 'Deleted',
    'msg.created': 'Created',
    'err.invalid': 'Fill in a cron expression and a command',
    'err.load': 'Failed to load tasks',
    'err.save': 'Failed to save',
    'expr.hint': 'min hour day month weekday, e.g. */5 * * * *',
    'nl.label': 'Natural language (optional)',
    'nl.placeholder': 'e.g. run backup every day at 9am',
    'nl.preview': 'Parsed as',
    'nl.unrecognized': 'Could not parse — fill in the expression manually',
    'detail.logs': 'Execution log',
    'detail.logs.refresh': 'Refresh',
    'detail.logs.empty.managed': 'No logs yet — recorded automatically after each run',
    'detail.logs.empty.system': 'This command does not redirect output to a log file',
  },
  es: {
    'panel.title': 'Tareas programadas',
    'panel.collapse': 'Contraer',
    'panel.expand': 'Expandir',
    'panel.add': 'Nueva tarea programada',
    'section.dsh': 'Tareas de DSH',
    'section.system': 'Tareas del sistema',
    'empty.system': 'No hay tareas del sistema',
    'dsh.hint.title': 'Crear en el chat',
    'dsh.hint.body': 'Pide al asistente que programe un recordatorio, p. ej. “recuérdame levantarme a las 9 de la mañana cada día”. Los recordatorios creados aparecerán aquí.',
    'dsh.hint.pending': '(La lista de recordatorios de la sesión actual llegará en una versión posterior)',
    'detail.title.new': 'Nueva tarea programada',
    'detail.title.edit': 'Detalles de la tarea',
    'detail.close': 'Cerrar',
    'detail.description': 'Descripción',
    'detail.description.placeholder': 'p. ej. copia de seguridad diaria',
    'detail.expr': 'Expresión cron',
    'detail.preset': 'Preajustes',
    'detail.command': 'Comando',
    'detail.command.placeholder': 'p. ej. /usr/local/bin/backup.sh',
    'detail.enabled': 'Habilitada',
    'detail.notify': 'Notificar al finalizar (push)',
    'detail.next': 'Próximas ejecuciones',
    'detail.notify.placeholder': 'Destino (telegram=chatId; discord=channelId; wecom=userid/ID de grupo; email=correo)',
    'detail.notify.hint': 'Envía el resultado al finalizar (requiere dsh-message-gateway conectado; QQ no admite push activo)',
    'detail.save': 'Guardar',
    'detail.delete': 'Eliminar',
    'detail.delete.confirm': '¿Eliminar esta tarea programada?',
    'detail.cancel': 'Cancelar',
    'preset.custom': 'Personalizado',
    'preset.everyMinute': 'Cada minuto',
    'preset.hourly': 'Cada hora',
    'preset.daily': 'Diario a las 00:00',
    'preset.weekly': 'Semanal (lun 00:00)',
    'preset.monthly': 'Mensual (día 1, 00:00)',
    'msg.saved': 'Guardado',
    'msg.deleted': 'Eliminado',
    'msg.created': 'Creado',
    'err.invalid': 'Rellena la expresión cron y el comando',
    'err.load': 'Error al cargar las tareas',
    'err.save': 'Error al guardar',
    'expr.hint': 'min hora día mes semana, p. ej. */5 * * * *',
    'nl.label': 'Lenguaje natural (opcional)',
    'nl.placeholder': 'p. ej. ejecutar copia cada día a las 9am',
    'nl.preview': 'Interpretado como',
    'nl.unrecognized': 'No se pudo interpretar — rellena la expresión manualmente',
    'detail.logs': 'Registro de ejecución',
    'detail.logs.refresh': 'Actualizar',
    'detail.logs.empty.managed': 'Aún sin registros — se graban automáticamente tras cada ejecución',
    'detail.logs.empty.system': 'Este comando no redirige la salida a un archivo de registro',
  },
}

/** 平台 locale 服务的结构面孔（见 index.ts）。 */
interface LocaleService {
  getLocale(): { active: string }
  subscribe(fn: () => void): () => void
}

let locale: LocaleService | null = null
let lang: Lang = 'zh'
let revision = 0
const listeners = new Set<() => void>()

function notify(): void {
  revision += 1
  for (const fn of listeners) fn()
}

function detectLang(): Lang {
  const active = locale?.getLocale().active
  if (active === 'zh') return 'zh'
  const nav = (navigator.language || '').toLowerCase()
  if (nav.startsWith('es')) return 'es'
  if (active === 'en') return 'en'
  if (nav.startsWith('zh')) return 'zh'
  return 'zh'
}

/** 接入平台 locale 服务；从 client 入口调用一次。 */
export function initI18n(service: LocaleService): void {
  if (locale === service) return
  locale = service
  lang = detectLang()
  service.subscribe(() => {
    const next = detectLang()
    if (next !== lang) {
      lang = next
      notify()
    }
  })
}

const subscribe = (fn: () => void): (() => void) => {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

const getSnapshot = (): number => revision

/** 翻译；缺失的 key 回退到中文。 */
export function t(key: string): string {
  return DICTS[lang][key] ?? DICTS.zh[key] ?? key
}

/** React hook：语言切换时触发重渲染；返回的 t() 为模块级稳定引用。 */
export function useT(): (key: string) => string {
  useSyncExternalStore(subscribe, getSnapshot)
  return t
}
