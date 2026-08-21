# dsh-cron-panel

[中文](README.md) · [Español](README.es.md)

A scheduled-tasks panel for the DSH Web GUI: sits between the workspace selector and settings in the sidebar, managing DSH tasks and system tasks (crontab) in separate sections, with natural-language creation, full-screen detail editing, and execution logs.

## Features

- **Sidebar panel**: below the workspace selector, above settings; ➕ on the header to create, ▾ to collapse (collapses to a slim title bar; state is persisted)
- **Separate sections**: DSH tasks (created via the panel, managed with markers) and system tasks (existing crontab entries) are shown apart
- **Natural-language creation**: type “run backup every day at 9am”, “clean temp files every 30 minutes”, “every Monday at 8pm” and it is parsed into a cron expression automatically (Chinese & English, 17+ patterns); manual expressions also supported
- **Full-screen details**: click a task to open a full-screen overlay over the conversation, close via the top-right ✕; edit / save / delete / enable-toggle supported
- **Next-run preview**: while editing, the next 5 execution times are shown automatically from the cron expression (avoids typos)
- **Notify on completion**: when editing a task you can configure "notify on completion" — after the task finishes, the result is pushed to the selected platform (Telegram / Discord / WeCom AI bot / Email); requires an installed and connected `dsh-message-gateway` (QQ has no active push). Push goes through the gateway's `/gateway/push`; the cron command gets a push segment appended automatically (exit code + task description), no extra setup needed
- **Execution logs**: panel-created tasks log automatically (`~/Library/Logs/dsh-cron-<id>.log`); system tasks reuse their existing log redirection; newest first, refreshable
- **Multilingual**: follows the DSH Web UI language (Chinese / English); Spanish browsers automatically get Spanish copy; defaults to Simplified Chinese
- Light / dark theme follows the DSH Web GUI

## Screenshots

**Sidebar panel** (DSH / system sections + add + collapse):

![Scheduled tasks panel](docs/cron-panel.png)

**Full-screen details** (edit form + execution log, close top-right):

![Task details](docs/cron-detail.png)

## Installation

```sh
dsh plugin --profile web add dsh-cron-panel
```

Restart `dsh web`, and the “Scheduled tasks” panel appears below the workspace selector in the sidebar.

> For local development, install via a link instead: `dsh plugin --profile web add link:/path/to/dsh-cron-panel`. After editing source, run `npm run build` and refresh the page to see changes.

## License

MIT
