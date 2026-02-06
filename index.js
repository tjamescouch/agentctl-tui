#!/usr/bin/env node
'use strict';

const blessed = require('blessed');
const fs = require('fs');
const path = require('path');
const { execFile, spawn } = require('child_process');
const os = require('os');

// --- Config ---
const AGENTS_DIR = path.join(os.homedir(), '.agentchat', 'agents');
const POLL_INTERVAL = 3000;
const LOG_TAIL_LINES = 100;
const DEBOUNCE_MS = 100;

// Find agentctl.sh - search known locations
function findAgentctl() {
  const candidates = [
    path.join(os.homedir(), 'dev/claude/agentchat/lib/supervisor/agentctl.sh'),
    path.join(os.homedir(), 'dev/claude/projects/agent5/agentchat/lib/supervisor/agentctl.sh'),
    path.join(__dirname, 'agentctl.sh'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

const AGENTCTL = findAgentctl();

// --- Agent State ---

function resolveStatus(agentDir) {
  const pidFile = path.join(agentDir, 'supervisor.pid');
  const stopFile = path.join(agentDir, 'stop');
  const stateFile = path.join(agentDir, 'state.json');

  if (fs.existsSync(stopFile)) return 'stopping';

  if (fs.existsSync(pidFile)) {
    try {
      const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
      if (pid && !isNaN(pid)) {
        try {
          process.kill(pid, 0);
          return 'running';
        } catch {
          return 'dead';
        }
      }
    } catch {}
    return 'dead';
  }

  if (fs.existsSync(stateFile)) {
    try {
      const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      if (state.status === 'stopped') return 'stopped';
    } catch {}
  }

  return 'stopped';
}

function readAgent(name) {
  const dir = path.join(AGENTS_DIR, name);
  const status = resolveStatus(dir);

  let pid = null;
  const pidFile = path.join(dir, 'supervisor.pid');
  if (fs.existsSync(pidFile)) {
    try {
      pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
      if (isNaN(pid)) pid = null;
    } catch {}
  }

  let mission = '';
  const missionFile = path.join(dir, 'mission.txt');
  if (fs.existsSync(missionFile)) {
    try { mission = fs.readFileSync(missionFile, 'utf8').trim(); } catch {}
  }

  let stateData = {};
  const stateFile = path.join(dir, 'state.json');
  if (fs.existsSync(stateFile)) {
    try { stateData = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch {}
  }

  let uptime = null;
  if (status === 'running' && pid) {
    try {
      const stat = fs.statSync(pidFile);
      uptime = Date.now() - stat.mtimeMs;
    } catch {}
  }

  return { name, dir, status, pid, mission, stateData, uptime };
}

function scanAgents() {
  if (!fs.existsSync(AGENTS_DIR)) return [];
  try {
    return fs.readdirSync(AGENTS_DIR)
      .filter(name => {
        const full = path.join(AGENTS_DIR, name);
        return fs.statSync(full).isDirectory();
      })
      .map(readAgent)
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

function formatUptime(ms) {
  if (!ms || ms < 0) return '-';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

// --- Log Streaming ---

function createLogStreamer() {
  let watcher = null;
  let filePos = 0;
  let currentFile = null;
  let debounceTimer = null;

  function tail(filePath, nLines) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      filePos = Buffer.byteLength(content, 'utf8');
      return lines.slice(-nLines).filter(Boolean);
    } catch {
      return [];
    }
  }

  function readNew(filePath, onLines) {
    try {
      const stat = fs.statSync(filePath);
      if (stat.size < filePos) {
        // File was truncated/rotated
        filePos = 0;
      }
      if (stat.size > filePos) {
        const fd = fs.openSync(filePath, 'r');
        const buf = Buffer.alloc(stat.size - filePos);
        fs.readSync(fd, buf, 0, buf.length, filePos);
        fs.closeSync(fd);
        filePos = stat.size;
        const newLines = buf.toString('utf8').split('\n').filter(Boolean);
        if (newLines.length > 0) onLines(newLines);
      }
    } catch {}
  }

  function start(logFile, onLines) {
    stop();
    currentFile = logFile;

    if (!fs.existsSync(logFile)) {
      onLines(['{grey-fg}No logs yet. Watching for output...{/grey-fg}']);
      // Watch parent dir for file creation
      const parentDir = path.dirname(logFile);
      if (fs.existsSync(parentDir)) {
        try {
          watcher = fs.watch(parentDir, (event, filename) => {
            if (filename === path.basename(logFile) && fs.existsSync(logFile)) {
              start(logFile, onLines);
            }
          });
        } catch {}
      }
      return;
    }

    const initialLines = tail(logFile, LOG_TAIL_LINES);
    if (initialLines.length === 0) {
      onLines(['{grey-fg}Waiting for output...{/grey-fg}']);
    } else {
      onLines(initialLines);
    }

    try {
      watcher = fs.watch(logFile, () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => readNew(logFile, onLines), DEBOUNCE_MS);
      });
    } catch {}
  }

  function stop() {
    if (watcher) { try { watcher.close(); } catch {} watcher = null; }
    if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
    filePos = 0;
    currentFile = null;
  }

  return { start, stop };
}

// --- TUI ---

function createUI() {
  const screen = blessed.screen({
    smartCSR: true,
    title: 'agentctl',
    fullUnicode: true,
  });

  // Left column container
  const leftCol = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: '30%',
    height: '100%',
  });

  // Agent list (top-left)
  const agentList = blessed.list({
    parent: leftCol,
    label: ' agents ',
    top: 0,
    left: 0,
    width: '100%',
    height: '55%',
    border: { type: 'line' },
    style: {
      border: { fg: 'cyan' },
      selected: { bg: 'blue', fg: 'white', bold: true },
      item: { fg: 'white' },
      label: { fg: 'cyan', bold: true },
    },
    keys: true,
    vi: true,
    mouse: true,
    scrollable: true,
    tags: true,
  });

  // Detail pane (bottom-left)
  const detailBox = blessed.box({
    parent: leftCol,
    label: ' detail ',
    top: '55%',
    left: 0,
    width: '100%',
    height: '45%',
    border: { type: 'line' },
    style: {
      border: { fg: 'cyan' },
      label: { fg: 'cyan', bold: true },
    },
    tags: true,
    scrollable: true,
  });

  // Log panel (right)
  const logBox = blessed.log({
    parent: screen,
    label: ' logs ',
    top: 0,
    left: '30%',
    width: '70%',
    height: '100%-1',
    border: { type: 'line' },
    style: {
      border: { fg: 'green' },
      label: { fg: 'green', bold: true },
    },
    tags: true,
    scrollable: true,
    scrollback: 1000,
    mouse: true,
    keys: true,
  });

  // Status bar
  const statusBar = blessed.box({
    parent: screen,
    bottom: 0,
    left: 0,
    width: '100%',
    height: 1,
    style: { bg: 'blue', fg: 'white' },
    tags: true,
  });

  function setStatus(msg) {
    statusBar.setContent(` ${msg}`);
    screen.render();
  }

  setStatus('[s]tart [x]stop [r]estart [k]ill [c]ontext [/]filter [q]uit');

  return { screen, agentList, detailBox, logBox, statusBar, setStatus };
}

// --- Main ---

function main() {
  const ui = createUI();
  const logStreamer = createLogStreamer();

  let agents = [];
  let selectedIdx = 0;
  let filterText = '';
  let filteredAgents = [];
  let confirmAction = null; // { action, agent } for kill confirmation
  let userScrolled = false;

  function getSelected() {
    return filteredAgents[selectedIdx] || null;
  }

  function statusIcon(status) {
    switch (status) {
      case 'running': return '{green-fg}●{/green-fg}';
      case 'stopping': return '{yellow-fg}◐{/yellow-fg}';
      case 'stopped': return '{grey-fg}○{/grey-fg}';
      case 'dead': return '{red-fg}✗{/red-fg}';
      default: return '{grey-fg}?{/grey-fg}';
    }
  }

  function statusColor(status) {
    switch (status) {
      case 'running': return 'green';
      case 'stopping': return 'yellow';
      case 'stopped': return 'grey';
      case 'dead': return 'red';
      default: return 'grey';
    }
  }

  function renderAgentList() {
    filteredAgents = agents.filter(a =>
      !filterText || a.name.toLowerCase().includes(filterText.toLowerCase())
    );

    const items = filteredAgents.map(a => {
      const icon = statusIcon(a.status);
      const padded = a.name.padEnd(14);
      return `${icon} ${padded} {${statusColor(a.status)}-fg}${a.status}{/${statusColor(a.status)}-fg}`;
    });

    ui.agentList.setItems(items);
    if (selectedIdx >= filteredAgents.length) selectedIdx = Math.max(0, filteredAgents.length - 1);
    ui.agentList.select(selectedIdx);

    if (filterText) {
      ui.agentList.setLabel(` agents [/${filterText}] `);
    } else {
      ui.agentList.setLabel(` agents (${filteredAgents.length}) `);
    }
  }

  function renderDetail() {
    const agent = getSelected();
    if (!agent) {
      ui.detailBox.setContent('{grey-fg}No agent selected{/grey-fg}');
      return;
    }

    const lines = [
      `{bold}Name:{/bold}    ${agent.name}`,
      `{bold}Status:{/bold}  {${statusColor(agent.status)}-fg}${agent.status}{/${statusColor(agent.status)}-fg}`,
      `{bold}PID:{/bold}     ${agent.pid || '-'}`,
      `{bold}Uptime:{/bold}  ${formatUptime(agent.uptime)}`,
      '',
      `{bold}Mission:{/bold}`,
      `  ${agent.mission || '{grey-fg}(none){/grey-fg}'}`,
      '',
      '{cyan-fg}[s]{/cyan-fg}tart  {cyan-fg}[x]{/cyan-fg}stop  {cyan-fg}[r]{/cyan-fg}estart',
      '{cyan-fg}[k]{/cyan-fg}ill   {cyan-fg}[c]{/cyan-fg}ontext {cyan-fg}[/]{/cyan-fg}filter',
    ];

    ui.detailBox.setContent(lines.join('\n'));
  }

  function switchLogStream() {
    const agent = getSelected();
    userScrolled = false;
    ui.logBox.setContent('');

    if (!agent) {
      ui.logBox.setLabel(' logs ');
      logStreamer.stop();
      return;
    }

    ui.logBox.setLabel(` logs: ${agent.name} `);
    const logFile = path.join(agent.dir, 'supervisor.log');

    logStreamer.start(logFile, (lines) => {
      for (const line of lines) {
        ui.logBox.log(line);
      }
      if (!userScrolled) {
        ui.logBox.setScrollPerc(100);
      }
      ui.screen.render();
    });
  }

  function refresh() {
    agents = scanAgents();
    const prevSelected = getSelected()?.name;
    renderAgentList();

    // Preserve selection
    if (prevSelected) {
      const idx = filteredAgents.findIndex(a => a.name === prevSelected);
      if (idx >= 0) {
        selectedIdx = idx;
        ui.agentList.select(selectedIdx);
      }
    }

    renderDetail();
    ui.screen.render();
  }

  function runAgentctl(command, agentName, extra, callback) {
    if (!AGENTCTL) {
      ui.setStatus('{red-fg}agentctl.sh not found{/red-fg}');
      return;
    }

    const args = [command, agentName];
    if (extra) args.push(extra);

    ui.setStatus(`Running: agentctl ${args.join(' ')}...`);

    execFile('bash', [AGENTCTL, ...args], { timeout: 30000 }, (err, stdout, stderr) => {
      const output = (stdout || '') + (stderr || '');
      const lines = output.trim().split('\n').filter(Boolean);
      for (const line of lines) {
        ui.logBox.log(`{yellow-fg}> ${line}{/yellow-fg}`);
      }
      if (err && !stdout && !stderr) {
        ui.logBox.log(`{red-fg}> Error: ${err.message}{/red-fg}`);
      }
      ui.setStatus('[s]tart [x]stop [r]estart [k]ill [c]ontext [/]filter [q]uit');
      ui.screen.render();
      // Refresh after action
      setTimeout(refresh, 1000);
      if (callback) callback(err);
    });
  }

  // --- Key bindings ---

  ui.agentList.on('select item', (item, idx) => {
    if (idx !== selectedIdx) {
      selectedIdx = idx;
      renderDetail();
      switchLogStream();
      ui.screen.render();
    }
  });

  // j/k navigation
  ui.screen.key(['j'], () => {
    if (selectedIdx < filteredAgents.length - 1) {
      selectedIdx++;
      ui.agentList.select(selectedIdx);
      renderDetail();
      switchLogStream();
      ui.screen.render();
    }
  });

  ui.screen.key(['k'], () => {
    if (selectedIdx > 0) {
      selectedIdx--;
      ui.agentList.select(selectedIdx);
      renderDetail();
      switchLogStream();
      ui.screen.render();
    }
  });

  // Start agent
  ui.screen.key(['s'], () => {
    if (confirmAction) return;
    const agent = getSelected();
    if (!agent) return;

    if (agent.status === 'running') {
      ui.setStatus(`{yellow-fg}${agent.name} is already running{/yellow-fg}`);
      setTimeout(() => ui.setStatus('[s]tart [x]stop [r]estart [k]ill [c]ontext [/]filter [q]uit'), 2000);
      return;
    }

    if (agent.mission) {
      runAgentctl('start', agent.name, agent.mission);
    } else {
      // Prompt for mission
      const input = blessed.textbox({
        parent: ui.screen,
        top: 'center',
        left: 'center',
        width: '60%',
        height: 3,
        border: { type: 'line' },
        style: { border: { fg: 'yellow' }, fg: 'white', bg: 'black' },
        label: ' mission for ' + agent.name + ' ',
        inputOnFocus: true,
      });
      input.focus();
      ui.screen.render();
      input.readInput((err, value) => {
        input.destroy();
        ui.screen.render();
        if (value && value.trim()) {
          runAgentctl('start', agent.name, value.trim());
        }
      });
    }
  });

  // Stop agent
  ui.screen.key(['x'], () => {
    if (confirmAction) return;
    const agent = getSelected();
    if (!agent) return;
    if (agent.status !== 'running') {
      ui.setStatus(`{yellow-fg}${agent.name} is not running{/yellow-fg}`);
      setTimeout(() => ui.setStatus('[s]tart [x]stop [r]estart [k]ill [c]ontext [/]filter [q]uit'), 2000);
      return;
    }
    runAgentctl('stop', agent.name);
  });

  // Restart agent
  ui.screen.key(['r'], () => {
    if (confirmAction) return;
    const agent = getSelected();
    if (!agent) return;
    runAgentctl('restart', agent.name);
  });

  // Kill agent (with confirmation)
  ui.screen.key(['K'], () => {
    const agent = getSelected();
    if (!agent) return;

    if (confirmAction) {
      confirmAction = null;
      ui.setStatus('[s]tart [x]stop [r]estart [k]ill [c]ontext [/]filter [q]uit');
      ui.screen.render();
      return;
    }

    confirmAction = { action: 'kill', agent };
    ui.setStatus(`{red-fg}Kill ${agent.name}? [y]es [n]o{/red-fg}`);
    ui.screen.render();
  });

  ui.screen.key(['y'], () => {
    if (!confirmAction) return;
    const { action, agent } = confirmAction;
    confirmAction = null;
    if (action === 'kill') {
      runAgentctl('kill', agent.name);
    }
  });

  ui.screen.key(['n'], () => {
    if (confirmAction) {
      confirmAction = null;
      ui.setStatus('[s]tart [x]stop [r]estart [k]ill [c]ontext [/]filter [q]uit');
      ui.screen.render();
    }
  });

  // Show context
  ui.screen.key(['c'], () => {
    if (confirmAction) return;
    const agent = getSelected();
    if (!agent) return;

    const contextFile = path.join(agent.dir, 'context.md');
    if (!fs.existsSync(contextFile)) {
      ui.logBox.log('{grey-fg}No context file{/grey-fg}');
      ui.screen.render();
      return;
    }

    try {
      const content = fs.readFileSync(contextFile, 'utf8');
      ui.logBox.setContent('');
      ui.logBox.setLabel(` context: ${agent.name} `);
      const lines = content.split('\n');
      for (const line of lines) {
        ui.logBox.log(line);
      }
      ui.screen.render();
    } catch {}
  });

  // Filter
  ui.screen.key(['/'], () => {
    if (confirmAction) return;
    const input = blessed.textbox({
      parent: ui.screen,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 1,
      style: { fg: 'white', bg: 'blue' },
      inputOnFocus: true,
    });
    input.focus();
    input.setValue(filterText);
    ui.screen.render();

    input.readInput((err, value) => {
      input.destroy();
      filterText = (value || '').trim();
      renderAgentList();
      renderDetail();
      if (filteredAgents.length > 0) switchLogStream();
      ui.setStatus('[s]tart [x]stop [r]estart [k]ill [c]ontext [/]filter [q]uit');
      ui.screen.render();
    });
  });

  // Clear filter with Escape
  ui.screen.key(['escape'], () => {
    if (confirmAction) {
      confirmAction = null;
      ui.setStatus('[s]tart [x]stop [r]estart [k]ill [c]ontext [/]filter [q]uit');
      ui.screen.render();
      return;
    }
    if (filterText) {
      filterText = '';
      renderAgentList();
      renderDetail();
      switchLogStream();
      ui.screen.render();
    }
  });

  // Log scrolling detection
  ui.logBox.on('scroll', () => {
    const scrollPerc = ui.logBox.getScrollPerc();
    userScrolled = scrollPerc < 100;
  });

  // Tab to switch focus between panels
  ui.screen.key(['tab'], () => {
    if (ui.logBox === ui.screen.focused) {
      ui.agentList.focus();
    } else {
      ui.logBox.focus();
    }
    ui.screen.render();
  });

  // Quit
  ui.screen.key(['q', 'C-c'], () => {
    logStreamer.stop();
    process.exit(0);
  });

  // Initial load
  ui.agentList.focus();
  refresh();
  switchLogStream();

  // Poll loop
  const pollTimer = setInterval(refresh, POLL_INTERVAL);

  ui.screen.render();
}

main();
