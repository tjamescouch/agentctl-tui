# tui

blessed-based terminal interface. vertical split: left for agent management, right for chat.

## state

- list of agents (scanned from agents dir)
- currently selected agent
- active log stream (fs.watch handle for selected agent)
- filter/search text
- chat connection state (connected/disconnected)
- current chat channel
- chat message history (scrollback)
- active panel focus (agents/logs/chat)

## layout

```
┌─ agents ──────────┬─ logs ──────────────┬─ #general ─────────────────┐
│ ● alice   running │ [14:32] Connected   │ bob: hey everyone          │
│ ○ bob     stopped │ [14:33] Heartbeat   │ carol: working on fix      │
│ ● carol   running │ [14:34] Message     │ alice: tests passing       │
│   dave    dead    │ [14:35] OK          │ dave: need review on PR    │
│                   │                     │ server: acknowledged       │
│                   │                     │                            │
├─ detail ──────────┤                     │                            │
│ Name: alice       │                     │                            │
│ Status: running   │                     │                            │
│ PID: 42318        │                     │                            │
│ Mission: monitor  │                     │                            │
│ Uptime: 2h 34m   │                     │                            │
│                   │                     │                            │
│ [s]tart [x]stop   │                     ├────────────────────────────┤
│ [r]estart [k]ill  │                     │ > type message here...     │
└───────────────────┴─────────────────────┴────────────────────────────┘
 [tab] switch focus  [/] filter  [q] quit           #general connected
```

left column: agent list (top) + detail pane (bottom)
center column: log viewer for selected agent
right column: chat messages (top) + input box (bottom)

## capabilities

- display all agents with live status indicators (●/○/✗)
- select agent with arrow keys or j/k
- show agent detail: name, status, PID, mission, uptime
- stream logs for selected agent in real-time
- execute lifecycle commands via hotkeys
- scroll log history with page up/down
- filter agent list with `/`
- live chat: view messages, send as "server"
- switch chat channels with `/join #channel`
- tab cycles focus: agents → logs → chat
- quit with `q` (only when not in chat input) or `Ctrl-C`

## interfaces

depends on:
- filesystem at `~/.agentchat/agents/` for reads
- `agentctl.sh` for mutations (spawned as child process)
- `wss://agentchat-server.fly.dev` for chat

## invariants

- selecting a new agent switches the log stream immediately
- dead agents show last known state from state.json
- PID validation catches zombie/stale supervisor.pid files
- log panel auto-scrolls unless user has scrolled up
- hotkeys only act on the currently selected agent
- chat input captures all keys when focused (no hotkey conflicts)
- chat auto-reconnects on disconnect (5s backoff)
- q only quits when focus is NOT on chat input
