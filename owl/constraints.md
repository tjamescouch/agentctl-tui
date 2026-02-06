# constraints

## stack

- node.js, single file entry point
- blessed for TUI rendering
- ws for websocket (agentchat protocol)
- no build step, no transpilation
- reads from `~/.agentchat/agents/` directly

## style

- minimal dependencies (blessed, ws)
- no classes, functional style
- unix philosophy: do one thing well

## data source

- agent state dir: `~/.agentchat/agents/<name>/`
- per agent files: `supervisor.pid`, `state.json`, `mission.txt`, `context.md`, `supervisor.log`, `stop` (signal file)
- wraps `agentctl.sh` for mutations (start/stop/kill/restart)
- reads filesystem directly for display (no shell-out for status)

## chat

- connects to `wss://agentchat-server.fly.dev` via raw websocket
- identifies as name "server" (no persistent identity/signing)
- joins `#general` by default
- channel switchable with `/join #channel`

## refresh

- agent list polls every 3 seconds
- log tail uses fs.watch on active log file
- status checks validate PIDs with `process.kill(pid, 0)`
- chat messages arrive in real-time via websocket
