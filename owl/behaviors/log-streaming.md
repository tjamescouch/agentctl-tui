# log streaming

real-time log tailing for the selected agent.

## flow

1. when an agent is selected, open `~/.agentchat/agents/<name>/supervisor.log`
2. read last 100 lines as initial content
3. start `fs.watch` on the log file
4. on file change, read new bytes from last known position
5. append new lines to the log panel
6. auto-scroll to bottom unless user has scrolled up

## switching agents

1. close current fs.watch handle
2. clear log panel
3. open new agent's log file
4. repeat from step 1

## edge cases

- log file doesn't exist yet: show "no logs" message, watch parent dir for file creation
- log file is empty: show "waiting for output..."
- agent has no state dir: show nothing
- log file rotated/truncated: detect size decrease, re-read from beginning
- rapid agent switching: debounce watch setup by 100ms

## display

- each line prefixed with timestamp if not already timestamped
- lines longer than terminal width wrap naturally (blessed handles this)
- log panel is scrollable with up/down/pageup/pagedown when focused
