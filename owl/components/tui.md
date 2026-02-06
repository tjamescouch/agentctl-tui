# tui

blessed-based terminal interface. three-panel layout.

## state

- list of agents (scanned from agents dir)
- currently selected agent
- active log stream (fs.watch handle for selected agent)
- command input buffer
- filter/search text

## layout

```
┌─ agents ─────────────┬─ logs ────────────────────────────┐
│ ● alice    running    │ [14:32:01] Connected to #general  │
│ ○ bob      stopped    │ [14:32:05] Listening...           │
│ ● carol    running    │ [14:32:12] Message from @dave     │
│   dave     dead       │ [14:33:01] Heartbeat OK           │
│                       │                                   │
│                       │                                   │
│                       │                                   │
├─ detail ─────────────┤│                                   │
│ Name: alice          ││                                   │
│ Status: running      ││                                   │
│ PID: 42318           ││                                   │
│ Mission: monitor ... ││                                   │
│ Uptime: 2h 34m      ││                                   │
│                      ││                                   │
│ [s]tart [x]stop      ││                                   │
│ [r]estart [k]ill     ││                                   │
│ [c]ontext [/]filter  ││                                   │
└──────────────────────┴───────────────────────────────────┘
```

left panel: agent list (top) + detail pane (bottom)
right panel: log viewer for selected agent

## capabilities

- display all agents with live status indicators (●/○/✗)
- select agent with arrow keys or j/k
- show agent detail: name, status, PID, mission, uptime
- stream logs for selected agent in real-time
- execute lifecycle commands via hotkeys
- scroll log history with page up/down
- filter agent list with `/`
- quit with `q` or `Ctrl-C`

## interfaces

depends on:
- filesystem at `~/.agentchat/agents/` for reads
- `agentctl.sh` for mutations (spawned as child process)

## invariants

- selecting a new agent switches the log stream immediately
- dead agents show last known state from state.json
- PID validation catches zombie/stale supervisor.pid files
- log panel auto-scrolls unless user has scrolled up
- hotkeys only act on the currently selected agent
