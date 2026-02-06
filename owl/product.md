# agentctl-tui

interactive terminal dashboard for managing supervised claude agents. wraps agentctl.sh functionality in a blessed-based TUI with real-time status, log streaming, agent lifecycle controls, and a live chat panel connected to the agentchat server.

## components

- [tui](components/tui.md) - the terminal interface

## behaviors

- [agent-lifecycle](behaviors/agent-lifecycle.md) - start/stop/restart/kill flows
- [log-streaming](behaviors/log-streaming.md) - real-time log tailing
- [chat](behaviors/chat.md) - real-time chat via agentchat websocket

## constraints

see [constraints.md](constraints.md)
