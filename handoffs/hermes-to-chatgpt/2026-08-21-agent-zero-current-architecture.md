# Agent Zero Current Architecture Validation

Validation timestamp: 2026-08-22T00:33:10-05:00
Requested handoff date/name: 2026-08-21
Device: Android / Termux (`/data/data/com.termux/files/home`)
Scope: current Agent Zero source, configuration, runtime, browser/device integration, persistent state, startup, security, drift, Voxel workspace relationship, and Hermes relationship.

## Audit safety and evidence rules

- Agent Zero source/configuration/state were inspected read-only. No Agent Zero file, dependency, process, service, browser, model route, tunnel, or port was intentionally modified, installed, stopped, restarted, or reconfigured.
- No paid or authenticated model inference was sent.
- Secrets are represented only as `[REDACTED]`; no secret value is in this report.
- During the audit, state changed externally: `127.0.0.1:5000` was closed and no Agent Zero process existed at 00:25:07-05:00, but a later probe found Agent Zero running as PID 9773. No audit command or delegated-audit transcript launched it. It was left running, per the prohibition on stopping or restarting it. Current-state conclusions use the later observation.
- GitHub handoff creation is outside the audited Agent Zero tree and is the only intentional write workflow.

## Executive conclusion

The authoritative installation is a manual native-Termux Git checkout at `/data/data/com.termux/files/home/projects/agent-zero`, branch `termux-native-nvidia`, commit `1d8b42bbc95b51657d00fdc10dc2cd58a6788a15` (`v2.10-3-g1d8b42bb`; application short version `v2.10`). Its tracked tree is clean, but its worktree is dirty because of 19 untracked legacy artifacts: one old Python-3.11 venv directory and 18 `*.before-*` backup entries.

At the final runtime observation, Agent Zero is running natively as `.venv/bin/python run_ui.py` (PID 9773, PPID 9736) from the authoritative checkout, bound only to `127.0.0.1:5000`. `/api/health` returns HTTP 200 from Uvicorn and confirms the exact branch and commit. The UI root also returns HTTP 200. No Agent Zero tunnel, Chromium CDP listener, A0 CLI connector, standalone MCP/A2A service, Termux:X11 session, VNC/noVNC, Xpra, or browser worker is active.

The selected `Default` model preset routes primary/chat and utility to NVIDIA NIM `nvidia/nemotron-3-ultra-550b-a55b`, and embeddings to NVIDIA NIM `nvidia/nemotron-3-embed-1b`. Authentication is sourced from `NVIDIA_NIM_API_KEY` in `usr/.env`; the value is `[REDACTED]`. There is no configured local model proxy and no automatic model fallback. NVIDIA's public API endpoint was reachable without sending credentials, but authenticated inference was deliberately not performed, so end-to-end model execution remains unverified.

Agent Zero's built-in browser plugin is explicitly disabled. Its Python Playwright-compatible dependency (`patchright`) and Agent Zero browser cache/binary are absent; the A0 CLI required for the host-browser connector is also absent. A separate Node Playwright 1.62.1 + Chromium 149 toolchain exists in `~/projects/voxel-ai-game`, but it is not Agent Zero's browser runtime. Port 9223 is closed and Agent Zero has no active or static configuration targeting it. Therefore Agent Zero cannot currently perform the requested browser/game inspection workflow reliably.

## A. Installation and source

```text
REPO_PATH=/data/data/com.termux/files/home/projects/agent-zero
REMOTE=https://github.com/agent0ai/agent-zero.git
CURRENT_BRANCH=termux-native-nvidia
CURRENT_COMMIT=1d8b42bbc95b51657d00fdc10dc2cd58a6788a15
GIT_DESCRIBE=v2.10-3-g1d8b42bb
VERSION=v2.10 (application short version); build T v2.10+3
WORKTREE_STATUS=DIRTY_UNTRACKED_ONLY
TRACKED_MODIFICATIONS=0
UNTRACKED_ENTRIES=19
INSTALL_METHOD=manual Git checkout + native Termux Python venv with system site-packages
PYTHON_VERSION=3.14.6
VENV_PATH=/data/data/com.termux/files/home/projects/agent-zero/.venv
PYTHON_EXECUTABLE=/data/data/com.termux/files/usr/bin/python3.14
NODE_VERSION_IF_USED=v24.13.0 (system; not required by the core UI)
PACKAGE_MANAGER=Python venv/pip plus Termux packages; no Node package manifest for Agent Zero
ENTRY_POINTS=~/bin/agent-zero; scripts/termux/agent-zero; run_ui.py; run_tunnel.py
```

The user launcher and repository launcher have identical SHA-256 `eceb53cafbbe18ee58823894372a4bac9b3628203409020dc977bef3d353cd45`. `~/bin` is not in the current PATH, so `agent-zero` is not discoverable by bare command; the absolute helper path is usable.

### Copy classification

| Path | Classification | Evidence |
|---|---|---|
| `~/projects/agent-zero` | `ACTIVE_PRIMARY` | Only checkout with `.git`, `run_ui.py`; live health reports its branch/commit; PID 9773 cwd is this path. |
| `~/projects/agent-zero/.venv` | `ACTIVE_PRIMARY` runtime | Python 3.14.6 venv, system-site-packages enabled. |
| `~/projects/agent-zero/.venv-old-py311-20260821-024145` | `STALE_OR_LEGACY` | Untracked old-venv backup; only four small files remain. |
| `~/projects/agent-zero-termux-smoke` | `NOT_AGENT_ZERO` | Two smoke-test files; no Git metadata, `run_ui.py`, or Agent Zero source. |
| `~/.gemini/tmp/agent-zero`, `~/.gemini/history/agent-zero` | `NOT_AGENT_ZERO` | Gemini history/cache containers, not source checkouts. |
| `~/.local`, `$PREFIX`, Debian PRoot, `hermes-ubuntu` PRoot | no Agent Zero install found | Scoped filesystem inventory found no second checkout/runtime. |
| `*.before-*` files under the primary checkout | `BACKUP` / `STALE_OR_LEGACY` | 18 untracked pre-change backups. |

## B. Configuration and precedence

### Active and historical sources

| Path | Role | State | Secret-bearing | Precedence |
|---|---|---|---|---|
| `usr/.env` | Runtime ID, timezone, NVIDIA credential | Active | YES | Loaded by `initialize.py` via `helpers/dotenv.py` with `override=True`; controls sensitive/runtime env settings. |
| `usr/plugins/_model_config/default_config.yaml` | Selects model preset `Default` | Active | NO | User plugin config overrides bundled plugin default. |
| `usr/plugins/_model_config/presets.yaml` | Defines current Default/Efficiency/Power routes | Active | NO | Active user preset collection overrides bundled/fallback presets. |
| `plugins/_model_config/default_config.yaml` | Bundled model-plugin defaults | Fallback | NO | Lower than user/project/profile plugin configuration. |
| `conf/model_providers.yaml` | Provider IDs, key variable mapping, model ID construction | Active source definition | NO | Provider schema; selected preset supplies values. |
| `usr/settings.json` | Global runtime/settings override | Absent | Potentially | If present, would override defaults; no file currently exists. |
| `A0_SET_*` environment variables | Runtime settings defaults/overrides | Not set for relevant MCP/A2A/browser values | Potentially | Environment-driven defaults before persisted settings. |
| `WEB_UI_HOST`, `WEB_UI_PORT` | UI bind override | Active in PID 9773: `127.0.0.1`, `5000` | NO | Launcher environment overrides source defaults. |
| `AUTH_LOGIN`, `AUTH_PASSWORD` | Web UI/API basic authentication | Not configured | YES | If set, protect UI/API; currently absent. |
| `plugins/_browser/.toggle-0` | Browser plugin disable marker | Active | NO | Plugin toggle resolution; disables `_browser`. |
| `plugins/_memory/.toggle-0` | Memory plugin disable marker | Active | NO | Disables `_memory`. |
| `plugins/_mcp_client/.toggle-0` | MCP client plugin disable marker | Active | NO | Disables `_mcp_client`. |
| `plugins/_migrate_agents/.toggle-0`, `_whatsapp_integration/.toggle-0` | Disable markers | Active | NO | Disable those plugins. |
| `plugins/*/default_config.yaml`, `plugin.yaml` | Bundled plugin defaults/metadata | Active only where plugin enabled and no higher override | Usually NO | Lowest plugin configuration layer. |
| `usr/plugins/_model_config/presets.yaml.before-nvidia-20260821-050655` | Pre-NVIDIA route snapshot | Stale backup | NO | No precedence; historical evidence only. |
| Other `*.before-*` files | Pre-Termux/Python/model edits | Stale backups | Some may reference config names | No precedence. |

Plugin asset precedence in `helpers/plugins.py` is project+agent profile, project, user+agent profile, user plugin, then bundled plugin. The current installation has no active project or profile-specific overrides. The selected model preset is `Default`. Alternate `Efficiency` and `Power` presets are selectable configurations, not automatic fallback routes.

No conflicting active model configuration was found. The apparent conflicts are historical backup files only.

## C. Effective model/provider routing

| Role | Display model | Actual routed model | Provider | Base URL | Auth method | Local proxy | Fallback | Status |
|---|---|---|---|---|---|---|---|---|
| chat / primary | `nvidia/nemotron-3-ultra-550b-a55b` | `nvidia/nemotron-3-ultra-550b-a55b` | `nvidia_nim` through LiteLLM | Provider default `https://integrate.api.nvidia.com/v1` (`api_base` blank) | `NVIDIA_NIM_API_KEY=[REDACTED]` from `usr/.env` | None | None automatic | Configured; public endpoint reachable; authenticated inference unverified. |
| utility | `nvidia/nemotron-3-ultra-550b-a55b` | `nvidia/nemotron-3-ultra-550b-a55b` | `nvidia_nim` | Same | Same | None | None automatic | Same. |
| embedding | `nvidia/nemotron-3-embed-1b` | `nvidia/nemotron-3-embed-1b` | `nvidia_nim` | Same | Same | None | None automatic | Configured; not exercised. |
| browser | No independent selected preset | Would inherit main model unless `_browser_model_active` is configured | NVIDIA route by inheritance | Same | Same | None | None | Browser plugin disabled; not operational. |
| vision | No separate active route; selected main preset has `vision: false` | None proven | N/A | N/A | N/A | None | None | No operational vision route. |

The previously observed NVIDIA/Nemotron routes remain current and are not UI-label aliases to a different configured upstream. No traffic-capture evidence was available, and no inference was sent. The NVIDIA `/v1/models` endpoint returned HTTP 200 without credentials during a non-inference reachability probe.

## D. Current runtime

### Current relevant process

```text
PROCESS=Agent Zero Web UI/runtime
PID=9773
PPID=9736
COMMAND=.venv/bin/python run_ui.py
EXECUTABLE=/data/data/com.termux/files/usr/bin/python3.14
WORKDIR=/data/data/com.termux/files/home/projects/agent-zero
TTY=/dev/pts/2
PORT=127.0.0.1:5000
LAUNCH_METHOD=interactive login shell; environment matches the native Termux launcher; exact typed parent command is unverified
ROLE=core Agent Zero runtime + Web UI/API/WS host
HEALTH=HTTP 200 /api/health, exact branch/commit confirmed
```

PID 9736 is `/data/data/com.termux/files/usr/bin/bash -l`, cwd `$HOME`. PID 9773 had sustained CPU around 27% after seven minutes despite no audit workload; this is an observed warning, not a diagnosed root cause.

### State transition during audit

- At 00:25:07-05:00: ports 5000, 55520, 55080, and 9223 refused connections; no `run_ui.py` process was found.
- Later: PID 9773 appeared and port 5000 became healthy.
- The audit did not start or stop it. Current canonical state is `RUNNING`.

### Other scoped services

| Surface | Current state |
|---|---|
| Agent Zero UI/API/WS on 5000 | Running, loopback. |
| Tunnel control on 55520 | Closed; `run_tunnel.py` not running. |
| Chromium CDP on 9223/9222 | Closed; no Chromium process. |
| A0/ACP reference port 32081 | Closed; `a0` CLI absent. |
| WhatsApp bridge 3100 | Closed; plugin disabled. |
| Code-execution SSH 55022 | Closed; native Termux mode bypasses SSH. |
| RFC 55080 | Closed. |
| Termux:X11/Xpra/VNC/noVNC | No process/listener. |
| Hermes Claude proxy 8080 | Running but unrelated to Agent Zero model routing. |

## E. Web UI and API surfaces

```text
WEB_UI_PRESENT=YES
WEB_UI_RUNNING=YES
LISTEN_ADDRESS=127.0.0.1
PORT=5000
API_PRESENT=YES
API_RUNNING=YES
WEBSOCKET_PRESENT=YES (/ws)
AUTHENTICATION=NONE_CONFIGURED
REMOTE_ACCESS=NO_ACTIVE_TUNNEL
LOCAL_ONLY=YES_CURRENTLY
```

Uvicorn hosts a Starlette/WSGI composition containing the browser UI, HTTP API handlers, Socket.IO namespace `/ws`, and mount points `/desktop`, `/mcp`, and `/a2a`. The current `/mcp` and `/a2a` GET probes returned 404 because both server features are disabled by default and there is no `usr/settings.json` or relevant `A0_SET_*` override. MCP client configuration is empty and its plugin is disabled. A2A server is disabled. No standalone MCP server, API daemon, callback listener, or remote tunnel was found.

The UI/API has no configured username/password. Mutation endpoints use CSRF logic, but this is not a substitute for authentication. Current risk is constrained by loopback binding. Starting a tunnel without first adding authentication would materially broaden exposure.

## F. Browser / Playwright architecture

```text
PLAYWRIGHT_INSTALLED=NO_FOR_AGENT_ZERO
PLAYWRIGHT_VERSION=NONE_FOR_AGENT_ZERO
PLAYWRIGHT_BROWSER_BINARIES=NONE_IN_AGENT_ZERO_CACHE
PLAYWRIGHT_HEALTH=NO
CHROMIUM_PATH=/data/data/com.termux/files/usr/bin/chromium-browser (system; not selected by Agent Zero)
CDP_SUPPORT=SOURCE_CAPABILITY_ONLY; no configured endpoint and no active listener
TERMUX_X11_INTEGRATION=NO
BROWSER_PROFILE=Agent Zero profile absent; intended path tmp/browser/sessions/<context>; host Chromium profiles are independent
DEFAULT_BROWSER_METHOD=disabled built-in Patchright persistent context
ALTERNATE_BROWSER_METHODS=A0 host-browser connector/CDP in source, unavailable because a0 CLI and endpoint configuration are absent
```

Agent Zero calls the Playwright-compatible `patchright` package, not Node Playwright. `patchright` is commented out in the Termux requirements, no distribution/module is installed in the Agent Zero venv, and `tmp/playwright` does not exist. Browser startup code can install a Chromium binary, but doing so was prohibited and the plugin is currently disabled.

The browser plugin's normal architecture is:

1. `_browser` enabled by plugin toggle.
2. Patchright persistent context.
3. Agent Zero-managed Chromium under `tmp/playwright`.
4. Per-context profile under `tmp/browser/sessions/<context>`.
5. Downloads under `usr/downloads/browser`, screenshots under `tmp/browser/screenshots/<context>`.
6. Optional virtual display/viewer using Xpra/X11 components.

None of those runtime directories/processes currently exists. `xpra`, `Xvfb`, and `xfce4-session` are unavailable.

A separate toolchain exists in `~/projects/voxel-ai-game`: Node Playwright 1.62.1, Termux shim/config, and system `headless_shell`/Chromium 149.0.7827.155. That proves device-level browser tooling exists, not that Agent Zero can use it.

### Chromium port 9223 relationship

- `127.0.0.1:9223` currently refuses connections.
- No Chromium/headless-shell process is running.
- Agent Zero's active environment lacks `A0_HOST_BROWSER_REMOTE_DEBUGGING_ENDPOINTS`.
- No current Agent Zero user/project configuration contains 9223.
- Source/docs support user-supplied CDP endpoints, usually illustrated with 9222, only through the A0 host-browser connector.
- `a0`/`a0-cli` is absent.

Conclusion: the previously observed 9223 Chromium runtime is currently stopped and was independent of Agent Zero. Agent Zero could be configured to use a CDP endpoint in a different architecture, but it does not currently know about or use 9223.

## G. Local device and Termux integration

| Capability | Actual current status |
|---|---|
| Native Termux shell | Configured and usable through `_code_execution`; native mode bypasses Docker/SSH. |
| Filesystem | Has the Termux app UID's access. Agent Zero repo/state and home are accessible. |
| Android shared storage | `$HOME/storage` links and `/sdcard` are readable/writable by the Termux UID; no new access was granted. |
| Network/localhost | Available through native code execution; UI itself is on loopback. |
| Termux:API | Package 0.59.1-1 installed; `termux-camera-photo`, `termux-open`, and `termux-open-url` exist. Device actions were not exercised. |
| Screenshots | No `termux-screenshot` command; no Agent Zero screenshot integration active. |
| Android intents | Generic Termux commands exist; no Agent Zero-specific intent tool/config was found. |
| ADB | Binary exists; no `adbd`/ADB process was observed; functionality unverified because invoking it could start a daemon. |
| Termux:X11 | Package installed, but no service/process, no `DISPLAY`, no `XDG_RUNTIME_DIR`, and no Agent Zero-specific integration. |
| Browser | System Chromium binaries exist, but no active browser process and Agent Zero browser plugin is disabled. |
| Game/client processes | No Voxel game/client process was found in scoped observations. |

The default tool policy is broad (`allow` with empty deny list). Native code execution therefore gives an Agent Zero task the same practical filesystem/network/device-command authority as the Termux account. This is usable but security-sensitive.

## H. Hermes relationship

```text
HERMES_RELATIONSHIP=LAUNCHABLE_BY_HERMES
```

Evidence:

- No Hermes skill, config, source adapter, shared memory, API client, port, MCP registration, or direct delegation hook targets Agent Zero.
- Hermes can mechanically execute the absolute launcher `/data/data/com.termux/files/home/bin/agent-zero` through its terminal tool. Bare `agent-zero` is not on PATH.
- Agent Zero's enabled `_orchestrator` plugin contains a Hermes terminal adapter (`binary = "hermes"`), and `hermes` is installed. This is generic subprocess orchestration from Agent Zero, not shared runtime state or a Hermes-to-Agent-Zero integration.
- The two systems share only host resources: Termux UID, filesystem, shell, localhost, and network. They do not share model configuration; the active Hermes proxy on 8080 is not referenced by Agent Zero's NVIDIA configuration.
- Memory/state stores are independent.

Thus they are independent runtimes with generic subprocess launchability in both directions; the requested single classification is `LAUNCHABLE_BY_HERMES`, not `DIRECTLY_INTEGRATED`.

## I. Persistent memory and state

```text
CANONICAL_STATE_PATHS=
  /data/data/com.termux/files/home/projects/agent-zero/usr
  /data/data/com.termux/files/home/projects/agent-zero/tmp (runtime cache; currently limited/absent for browser/memory)
MEMORY_SYSTEM=_memory plugin with FAISS-compatible vector store architecture, currently disabled
DATABASES=No active SQLite/vector database found
LOGS=Historical ~/a0_run_20260821-042438.log and install log; live PID writes to /dev/pts/2
BROWSER_STATE=No Agent Zero browser profile/cache; intended tmp/browser and tmp/playwright paths absent
TASK_HISTORY=7 chat directories with chat.json/message artifacts; usr/scheduler/tasks.json empty
PROJECT_STATE=usr/projects empty; usr/knowledge has empty main/custom structure; usr/workdir has one policy prompt include
```

Current state inventory:

- `usr/chats`: seven persisted chat directories. User content was not copied into this handoff.
- `usr/knowledge`: no substantive knowledge documents.
- `usr/projects`: empty; no active project record.
- `usr/scheduler/tasks.json`: empty task list.
- `usr/plugins`: model presets, OAuth lock directory, Office/Whisper state/config.
- `_memory` is disabled by toggle; no `usr/memory`, `tmp/memory`, FAISS index, or other live vector-store files were found.
- One zero-length OAuth lock file exists with no matching Agent Zero OAuth worker identified; treat as a stale-lock candidate, not proven harmful.
- Historical log `~/a0_run_20260821-042438.log` is approximately 110 MB and contains a prior high-frequency Python 3.14/nest_asyncio error loop. Current source includes later compatibility commits, but the live process's sustained CPU warrants follow-up outside this read-only task.

## J. Project/workspace relationships

### `~/projects/voxel-ai-game`

- No Agent Zero project record, symlink, user-state reference, script, launcher, prompt, or explicit workspace configuration points to `voxel-ai-game`.
- Agent Zero can access that path through native Termux code execution because it shares the same UID; this is generic filesystem access, not project integration.
- Voxel has its own `e2e/playwright.termux.config.ts`, `e2e/playwright.config.ts`, Node Playwright 1.62.1, Termux shim, and Chromium/headless-shell 149.
- No Voxel-side Agent Zero launcher or helper was found.
- Agent Zero's persisted chat content contains historical mentions of browser/CDP concepts, but that is task history, not active configuration.

Conclusion: `voxel-ai-game` has an independent local inspection toolchain. Agent Zero is not currently configured to operate it and cannot reliably inspect it through browser automation in its present state.

## K. Startup and autostart

```text
AUTOSTART=NO
LOGIN_START=NO
MANUAL=YES
ON_DEMAND=YES
```

- `~/.bashrc`, `$PREFIX/etc/profile`, profile.d files, Termux Boot locations, and Termux services contain no Agent Zero start command.
- `~/.termux/boot` and `~/.config/termux/boot` do not exist.
- Termux services present: `cupsd`, `ssh-agent`, `sshd`, `tx11`, `tx11-xfce4`; none starts Agent Zero, and X11 services are down.
- `~/bin/agent-zero` is a manual, idempotent launcher: it checks `/api/health`, refuses to take over a foreign port 5000 service, sets native Termux environment, and `exec`s `.venv/bin/python run_ui.py`.
- The current server was launched from an interactive login shell and is therefore manual/on-demand. Exact command attribution is unverified.
- No Agent Zero PID file, nohup wrapper, rc service, daemon supervisor, or boot hook was found.

## L. Security review

1. **No active external listener found for Agent Zero.** Current bind is loopback `127.0.0.1:5000`; tunnel and remote surfaces are closed.
2. **UI/API authentication is absent.** This is acceptable only while loopback-only. Launching the included tunnel would expose an unauthenticated control surface unless auth is configured first.
3. **Credential storage permissions are restrictive.** `usr/.env` is mode 0600 and ancestor directories are 0700. Credential values are `[REDACTED]`.
4. **No live credential embedded in tracked source was detected by the scoped regex scan.** Test fixtures contain placeholder/mock secret patterns only.
5. **Native command execution is broad.** The enabled code-execution/tool policy can run commands with the full Termux app UID's filesystem, shared-storage, network, and available device-command permissions.
6. **Browser profiles are sensitive.** Independent Chromium profiles under `~/.config/chromium*` are mode 0700 but contain browsing state. Agent Zero has no current profile and no configured access path to those profiles.
7. **Stale artifacts exist.** Nineteen untracked backup/old-venv entries and a zero-length OAuth lock can confuse maintenance. No deletion was performed.
8. **Sustained live CPU is anomalous.** PID 9773 showed about 27% CPU after seven minutes. A historical 110 MB log records a prior runtime error loop. Root cause is unverified; no trace/restart was attempted.
9. **No stale active tunnel was found.** Ports 55520, 32081, 9222/9223, 3100, 55022, and 55080 were closed.

## M. Drift and legacy findings

| Item | Evidence | Impact | Confidence |
|---|---|---|---|
| Worktree is not fully clean | Git status: 19 untracked entries, zero tracked changes | Backups can be mistaken for active config/code and complicate updates. | High |
| Earlier `installed but stopped` state is stale | Current PID 9773 and HTTP 200 on 5000 | Canonical state is now running. | High |
| Port 9223 assumption is stale | Connection refused; no Chromium process/config reference | No current CDP/browser workflow. | High |
| Playwright expectation is stale for Agent Zero | `_browser` disabled; Patchright absent; no A0 browser cache | Browser tool cannot start as configured. | High |
| Device Playwright differs from Agent Zero | Node Playwright 1.62.1 exists only in Voxel; Agent Zero expects Python Patchright | Do not treat Voxel browser readiness as Agent Zero readiness. | High |
| Termux:X11 expectation is stale | Package exists but service/process/env absent; Agent Zero uses Xpra architecture when enabled | No visible desktop/browser path. | High |
| ACP/A0 docs reference 32081 but CLI absent | Port closed and no `a0` command | Host-browser/ACP connector unavailable. | High |
| Enabled plugin does not mean active service | Telegram/Email/Desktop/Office/etc. have enabled toggles but empty/disabled runtime settings or missing dependencies | Installed capability inventory overstates operational surfaces. | High |
| Historical Python 3.14 runtime error storm | 110 MB log with ~310,090 repeated compatibility errors; later source commits changed compatibility code | Live high CPU may indicate remaining drift; no post-launch log available. | Medium |
| Launcher not on PATH | `command -v agent-zero` empty; `~/bin` absent from PATH | Hermes/user must call absolute path or change environment outside this task. | High |
| Old provider backup remains | `presets.yaml.before-nvidia-20260821-050655` differs from active NVIDIA preset | Historical route can be misread as current. | High |
| Memory defaults exist but memory is disabled | `_memory/.toggle-0`, no vector-state files | Persistent semantic memory is unavailable despite source defaults. | High |

## N. Functional readiness verdicts

```text
CORE_AGENT_READY=PARTIAL
WEB_UI_READY=YES
MODEL_ROUTE_READY=PARTIAL
BROWSER_AUTOMATION_READY=NO
PLAYWRIGHT_READY=NO
TERMUX_X11_READY=NO
VOXEL_LOCAL_INSPECTION_READY=NO
HERMES_DELEGATION_READY=PARTIAL
```

Blockers:

- `CORE_AGENT_READY=PARTIAL`: runtime and UI health are live, source compiles, and dependencies resolve, but sustained CPU is anomalous; semantic memory and browser subsystems are disabled; no end-to-end task was run under the read-only constraint.
- `MODEL_ROUTE_READY=PARTIAL`: active presets, provider mapping, credential presence, and endpoint reachability are proven; authenticated chat/utility/embedding inference was deliberately not performed.
- `BROWSER_AUTOMATION_READY=NO`: browser plugin disabled, Patchright absent, A0 CLI absent, no browser profile/cache/runtime, no CDP endpoint.
- `PLAYWRIGHT_READY=NO`: no Agent Zero Patchright/Playwright package or managed Chromium binary. Voxel's independent Node Playwright does not satisfy this.
- `TERMUX_X11_READY=NO`: no running X11 service/session, no DISPLAY/XDG environment, and no Agent Zero integration.
- `VOXEL_LOCAL_INSPECTION_READY=NO`: no explicit Agent Zero workspace integration, 9223 stopped, and Agent Zero browser stack unavailable.
- `HERMES_DELEGATION_READY=PARTIAL`: Hermes can invoke the absolute launcher and Agent Zero can invoke the installed `hermes` CLI generically, but there is no formal skill/API/shared-memory integration and no delegation test was performed.

## O. Canonical architecture graph

```text
Human
  |
  v
Android / Termux (u0_a298)
  |
  +--> Agent Zero native runtime
  |      path: ~/projects/agent-zero
  |      branch/commit: termux-native-nvidia @ 1d8b42bbc95b...
  |      process: PID 9773, Python 3.14.6, run_ui.py
  |      |
  |      +--> Model routing (LiteLLM)
  |      |      chat/utility --> NVIDIA NIM
  |      |      nvidia/nemotron-3-ultra-550b-a55b
  |      |      embedding --> NVIDIA NIM
  |      |      nvidia/nemotron-3-embed-1b
  |      |      endpoint --> https://integrate.api.nvidia.com/v1
  |      |      auth --> usr/.env:NVIDIA_NIM_API_KEY=[REDACTED]
  |      |      local proxy/fallback --> none
  |      |
  |      +--> Tools
  |      |      core web/search/code/document/data tools
  |      |      native Termux code execution
  |      |      enabled plugin toolsets, some inactive due missing config/deps
  |      |
  |      +--> Browser automation
  |      |      built-in _browser --> DISABLED
  |      |      Python Patchright/cache --> ABSENT
  |      |      A0 host connector --> unavailable (a0 CLI absent)
  |      |      CDP 127.0.0.1:9223 --> CLOSED / not configured
  |      |
  |      +--> Memory/state
  |      |      usr/chats (7 chats), usr/scheduler, usr/workdir
  |      |      semantic _memory --> DISABLED; no active vector DB
  |      |
  |      +--> Web UI/API/WS
  |      |      http://127.0.0.1:5000 --> RUNNING / healthy
  |      |      /ws present; /mcp and /a2a disabled
  |      |      authentication --> none configured
  |      |      tunnel 55520 --> STOPPED
  |      |
  |      +--> Workspace access
  |             generic Termux filesystem access
  |             ~/projects/voxel-ai-game --> no explicit A0 project binding
  |
  +--> Voxel independent browser toolchain
  |      Node Playwright 1.62.1 + Chromium/headless_shell 149
  |      no active CDP listener
  |
  +--> Termux:X11 package
  |      services/session/env --> DOWN / absent
  |
  +--> Hermes Agent
         separate process/config/memory/model route
         no direct Agent Zero integration
         can launch ~/bin/agent-zero via terminal
         Agent Zero orchestrator can call `hermes` as generic subprocess
```

## P. Canonical memory snapshot

=== CANONICAL AGENT ZERO MEMORY SNAPSHOT ===

- **Authoritative install path:** `/data/data/com.termux/files/home/projects/agent-zero`.
- **Source:** `https://github.com/agent0ai/agent-zero.git`; branch `termux-native-nvidia`; commit `1d8b42bbc95b51657d00fdc10dc2cd58a6788a15`; describe `v2.10-3-g1d8b42bb`; app version `v2.10` / build `T v2.10+3`.
- **Runtime:** native Termux Python 3.14.6 in `.venv` with system site-packages. Manual Git/venv install, not Docker and not a PRoot install.
- **Working tree:** zero tracked changes; dirty because of 19 untracked legacy artifacts (18 `*.before-*` backups plus `.venv-old-py311-20260821-024145`).
- **Launch method:** `/data/data/com.termux/files/home/bin/agent-zero` or repository `scripts/termux/agent-zero`; both are identical idempotent launchers. Bare `agent-zero` is not on PATH. Launcher executes `.venv/bin/python run_ui.py` with native Termux LD preload and `127.0.0.1:5000`.
- **Current state:** `RUNNING`. PID 9773, PPID 9736, cwd authoritative repo, TTY `/dev/pts/2`. The runtime appeared during the audit after an earlier stopped observation; the audit did not start it.
- **Web UI/API:** running and healthy at `http://127.0.0.1:5000`; Uvicorn; `/api/health` and `/` return HTTP 200. WebSocket `/ws` is present. UI/API authentication is not configured. Remote tunnel/API on 55520 is stopped. MCP and A2A server mounts are disabled; no separate daemon is active.
- **Primary model:** NVIDIA NIM `nvidia/nemotron-3-ultra-550b-a55b` through LiteLLM, default NVIDIA endpoint `https://integrate.api.nvidia.com/v1`, no local proxy, no automatic fallback.
- **Utility model:** same NVIDIA NIM model and route as primary.
- **Embedding model:** NVIDIA NIM `nvidia/nemotron-3-embed-1b`.
- **Credentials:** active runtime credential source is `usr/.env`, variable `NVIDIA_NIM_API_KEY=[REDACTED]`, mode 0600. No secret value is in this snapshot.
- **Model readiness:** configuration, key presence, and public endpoint reachability are verified; authenticated inference was not sent, so end-to-end model readiness is `PARTIAL`.
- **Browser architecture:** built-in `_browser` expects Python Patchright, Agent Zero-managed Chromium cache, per-context profiles, and optional Xpra viewer. The plugin is currently disabled, Patchright/cache/profile are absent, and `a0` CLI host connector is unavailable.
- **Playwright:** `NO` for Agent Zero. Voxel separately has Node Playwright 1.62.1 and Chromium/headless-shell 149; that is not Agent Zero's runtime.
- **Chromium/CDP:** no Chromium process; 9222/9223 closed. Agent Zero has no current endpoint config for 9223 and is independent of the previously observed CDP runtime.
- **Termux:X11:** package installed but no service/session/env and no Agent Zero integration; readiness `NO`.
- **Hermes relationship:** `LAUNCHABLE_BY_HERMES`. No direct skill/API/shared-memory/model/port integration. Hermes can run the absolute launcher; Agent Zero's orchestrator can call `hermes` as a generic subprocess.
- **Persistent state:** `usr/chats` has seven chat histories; `usr/scheduler/tasks.json` is empty; `usr/projects` is empty; `usr/knowledge` has no substantive knowledge; `_memory` is disabled and there is no active vector DB; Agent Zero browser state is absent.
- **Voxel relationship:** no explicit Agent Zero project/workspace/script binding. Generic same-UID filesystem access only. Voxel browser test tooling is independent.
- **Autostart:** none. No boot/login/service/daemon start chain. Current launch is manual/on-demand.
- **Security findings:** current Agent Zero listener is loopback-only; UI/API has no authentication; credentials are mode 0600 under mode-0700 directories; native code execution has broad Termux UID authority; no active tunnel; independent browser profiles contain sensitive state; stale backup/lock artifacts remain.
- **Drift findings:** old stopped-state and 9223 assumptions are stale; 19 untracked legacy artifacts; browser/Playwright disabled or absent; A0 CLI absent; memory disabled; some plugins enabled but not operational; old NVIDIA predecessor preset remains as backup; PID 9773 has anomalously sustained CPU and a historical runtime log records a prior error storm.
- **Readiness:** `CORE_AGENT_READY=PARTIAL`; `WEB_UI_READY=YES`; `MODEL_ROUTE_READY=PARTIAL`; `BROWSER_AUTOMATION_READY=NO`; `PLAYWRIGHT_READY=NO`; `TERMUX_X11_READY=NO`; `VOXEL_LOCAL_INSPECTION_READY=NO`; `HERMES_DELEGATION_READY=PARTIAL`.
- **Still unverified:** authenticated NVIDIA inference; actual chat/embedding response; browser startup after installing/enabling prerequisites; ADB/device actions; current high-CPU root cause; exact shell command that launched PID 9773; end-to-end Voxel inspection; end-to-end Hermes delegation.

This snapshot supersedes older assumptions about Agent Zero's current running/stopped state, browser/CDP association, and functional readiness.
