# constraints

## stack

- node.js, single file entry point
- blessed for TUI rendering
- no build step, no transpilation
- reads from `~/.agentchat/agents/` directly

## style

- minimal dependencies (blessed only)
- no classes, functional style
- unix philosophy: do one thing well

## data source

- agent state dir: `~/.agentchat/agents/<name>/`
- per agent files: `supervisor.pid`, `state.json`, `mission.txt`, `context.md`, `supervisor.log`, `stop` (signal file)
- wraps `agentctl.sh` for mutations (start/stop/kill/restart)
- reads filesystem directly for display (no shell-out for status)

## refresh

- agent list polls every 3 seconds
- log tail uses fs.watch on active log file
- status checks validate PIDs with `process.kill(pid, 0)`
