# dsh-cron-panel

[English](README.en.md) · [Español](README.es.md)

DSH Web GUI 的定时任务面板：位于侧边栏工作区与设置之间，分区管理 DSH 定时任务与系统定时任务（crontab），支持自然语言创建、全屏详情编辑、执行记录查看。

## 功能

- **侧边栏面板**：工作区下方、设置上方；标题右侧 ➕ 新增、▾ 收起（收起后折叠成一条小标题栏，状态持久化）
- **分区展示**：DSH 定时任务（面板创建，带管理标记）与系统定时任务（crontab 原有条目）分开显示
- **自然语言创建**：输入「每天上午 9 点运行备份」「每 30 分钟清理临时文件」「每周一晚上 8 点」即自动解析为 cron 表达式（中英文，17+ 常见模式），也可手动填写
- **全屏详情**：点击任务在对话区全屏覆盖，右上角关闭；支持编辑 / 保存 / 删除 / 启停
- **执行记录**：面板创建的任务自动记录日志（`~/Library/Logs/dsh-cron-<id>.log`）；系统任务自动读取命令中已有的日志重定向；最新在上、可刷新
- **多语言**：自动跟随 DSH Web 界面语言（中文 / 英文），西班牙语浏览器自动切换西班牙语，默认简体中文
- 明暗主题跟随 DSH Web GUI

## 界面预览

**侧边栏面板**（DSH / 系统分区 + 新增 + 收起）：

![定时任务面板](docs/cron-panel.png)

**全屏详情**（编辑表单 + 执行记录，右上角关闭）：

![定时任务详情](docs/cron-detail.png)

## 安装

```sh
dsh plugin --profile web add dsh-cron-panel
```

重启 `dsh web`，侧边栏工作区下方出现「定时任务」面板。

> 本地开发时可用 `dsh plugin --profile web add link:/path/to/dsh-cron-panel` 以链接方式安装，修改源码后 `npm run build` 并刷新页面即可生效。

## License

MIT
