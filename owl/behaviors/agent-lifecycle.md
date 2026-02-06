# agent lifecycle

how the TUI manages agent state transitions.

## flow

1. user selects an agent from the list
2. detail pane shows current state (read from state.json + pid check)
3. user presses a hotkey:
   - `s` → start: prompts for mission if no mission.txt exists, spawns `agentctl.sh start <name> <mission>`
   - `x` → stop: spawns `agentctl.sh stop <name>`, creates stop file
   - `r` → restart: spawns `agentctl.sh restart <name>`
   - `k` → kill: confirms with user, then spawns `agentctl.sh kill <name>`
4. TUI shows command output in log panel temporarily
5. next poll cycle picks up new state

## status resolution

status is derived (not just read from state.json):

1. if `supervisor.pid` exists and process is alive → `running`
2. if `supervisor.pid` exists but process is dead → `dead` (stale pid)
3. if `stop` file exists → `stopping`
4. if no pid file and state.json says stopped → `stopped`
5. if no state dir at all → not shown

## confirmation

- `kill` requires confirmation (y/n prompt in status bar)
- `stop` does not require confirmation
- `start` on already-running agent is rejected with message
- `restart` on stopped agent acts as `start`
