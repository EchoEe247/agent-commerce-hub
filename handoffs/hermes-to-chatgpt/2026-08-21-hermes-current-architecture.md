HERMES_CURRENT_ARCHITECTURE_VALIDATION

AUDIT_TIMESTAMP=2026-08-21T22:59:30-05:00
HOST_ENVIRONMENT=Google Pixel 6a; Android 17; aarch64; native Termux 0.118.3 (F-Droid)
PRIMARY_HERMES_INSTANCE=Native Termux Hermes CLI, PID 19017
HERMES_VERSION=0.20.0 (2026.8.3)
HERMES_EXECUTABLE=/data/data/com.termux/files/usr/bin/hermes
HERMES_HOME=/data/data/com.termux/files/home/.hermes
PRIMARY_CONFIG=/data/data/com.termux/files/home/.hermes/config.yaml
STATE_DB=/data/data/com.termux/files/home/.hermes/state.db

ARCHITECTURE_VERDICT=The native Termux installation is the active primary control plane. It runs as an interactive local CLI, routes its current model directly to OpenAI Codex using OAuth, controls local tools and subprocesses, and has two shell-autostarted helper proxies. An Ubuntu/PRoot Hermes installation still exists but is not running and is now an optional secondary/legacy environment. No running Hermes cloud/server instance or messaging gateway was found.
CONFIDENCE=HIGH for local installation, configuration, processes, ports, and state; MEDIUM for remote/cloud resources that lack installed CLIs or live authenticated inspection.

=== EXECUTIVE ARCHITECTURE ===

The active architecture is:

1. Human opens an interactive Termux shell.
2. Termux `/etc/profile` sources `~/.bashrc`.
3. `~/.bashrc`:
   - starts or verifies the Claude-Code compatibility proxy on `127.0.0.1:8080`;
   - starts or verifies the OpenCode Free proxy on `127.0.0.1:20130`;
   - defines a `hermes()` shell function that applies a local source guard before launching Hermes.
4. Hermes is launched manually.
5. `/data/data/com.termux/files/usr/bin/hermes` executes the editable venv installation under `~/.hermes/hermes-agent`.
6. The current Hermes session uses:
   - provider: `openai-codex`
   - model: `gpt-5.6-sol`
   - transport: Codex Responses API
   - endpoint: `https://chatgpt.com/backend-api/codex`
   - authentication: stored OpenAI Codex OAuth/device-code credential
   - reasoning effort: `medium`
7. Local shell, file, code execution, skills, memory, delegation, cron, vision and related tools are provided by the Termux Hermes process.
8. The Hermes gateway, messaging platforms, scheduler jobs and commerce MCP subprocess are not running.
9. Independent local runtimes currently active alongside Hermes are:
   - OpenCode Free proxy;
   - Claude-Code/Mantle proxy;
   - Chromium interactive CDP service;
   - voxel game backend and Vite client.

No Docker, systemd, remote Hermes gateway, Telegram runtime, Render runtime, cloudflared tunnel, Agent Zero process, or Ubuntu Hermes process is active.

=== PRIMARY HERMES INSTANCE ===

HOST

- OS kernel: Linux `6.1.157-android14-11-gbd23337e42e7-ab14791245`
- Android version: 17
- Device: Google Pixel 6a
- Architecture: aarch64
- Runtime: native Termux, not inside PRoot or a container
- Termux version: 0.118.3, F-Droid build
- `$HOME`: `/data/data/com.termux/files/home`
- `$PREFIX`: `/data/data/com.termux/files/usr`
- Shell: `/data/data/com.termux/files/usr/bin/bash`

ACTIVE INSTALLATION

- Launcher: `/data/data/com.termux/files/usr/bin/hermes`
- Launcher implementation:
  - shell wrapper;
  - injects the Termux Python 3.11 shared library through `LD_PRELOAD`;
  - executes `~/.hermes/hermes-agent/venv/bin/hermes`.
- Real Python entry point:
  `/data/data/com.termux/files/home/.hermes/hermes-agent/venv/bin/hermes`
- Python: 3.11.15
- OpenAI SDK: 2.24.0
- Package: `hermes-agent 0.20.0`
- Installation form:
  - Git checkout at `~/.hermes/hermes-agent`;
  - Python venv at `~/.hermes/hermes-agent/venv`;
  - editable pip installation pointing back to the Git checkout.
- Upstream remote:
  `https://github.com/NousResearch/hermes-agent.git`
- Current branch:
  `angel/oci-grok420-chat-fix`
- Current inspected commit:
  `16b5105fe839ffccf3188282e48efa23bcf2c562`
- The checkout has local modifications and is not a stock clean installation.

CURRENT PROCESS

- PID: 19017
- PPID: 18978, interactive Termux login shell
- Command:
  `~/.hermes/hermes-agent/venv/bin/python ~/.hermes/hermes-agent/venv/bin/hermes`
- Working directory: `/data/data/com.termux/files/home`
- Surface: interactive CLI
- TCP listener: none attributable to the CLI process
- Gateway: not running

ADDITIONAL HERMES INSTALLATIONS

1. Ubuntu/PRoot Hermes

   - PRoot distribution: `hermes-ubuntu`
   - `$HOME` inside it: `/root`
   - executable: `/usr/local/bin/hermes`
   - installation: `/usr/local/lib/hermes-agent`
   - version: 0.20.0 (2026.8.3)
   - bundled Hermes Python: 3.11.15
   - system Python: 3.12.3
   - config: `/root/.hermes/config.yaml`
   - state DB: `/root/.hermes/state.db`, 23,097,344 bytes
   - state last observed modified: 2026-08-19
   - configured default:
     `custom / MiniMaxAI/MiniMax-M2.7`
   - endpoint:
     `https://api.vultrinference.com/v1`
   - running: NO
   - role: available through `ubuntu`, `hermesu`, and `codexu` shell aliases; no longer the primary control plane.
   - classification: AVAILABLE_ON_DEMAND / SECONDARY-LEGACY

2. Debian/PRoot

   - Distribution exists.
   - No `/root/.hermes` was found.
   - `command -v hermes` resolves to the bind-mounted Termux launcher, not an independent Debian Hermes installation.
   - classification: NOT A SEPARATE HERMES INSTALLATION

3. Backup source trees

   - `~/.hermes-before-ubuntu-20260812-013136/hermes-agent`
   - `~/.hermes/hermes-agent.ubuntu-copy-20260812-013546`
   - both are old commit `8f2712725af7`, branch `main`.
   - neither is running.
   - classification: STALE_OR_LEGACY

4. Hermes cloud/server instances

   - No SSH configuration, cloud Hermes process, gateway route, gateway service, remote profile or active gateway was found.
   - `gateway_routing` currently has zero rows.
   - classification: NOT_FOUND locally; external instances not discoverable without a supplied host/account are UNVERIFIED.

=== PROVIDER / MODEL ROUTING ===

CURRENT DEFAULT AND CURRENT SESSION

DISPLAY_NAME=OpenAI Codex
INTERNAL_PROVIDER_ID=openai-codex
BASE_URL_OR_TRANSPORT=https://chatgpt.com/backend-api/codex; Codex Responses API
AUTH_METHOD=*** device-code credential in `~/.hermes/auth.json`
DEFAULT_OR_OPTIONAL=DEFAULT AND CURRENT
AVAILABLE_MODELS=cached: gpt-5.6-sol, gpt-5.6-terra, gpt-5.6-luna, gpt-5.5, gpt-5.4, gpt-5.4-mini, gpt-5.6-sol-pro, gpt-5.6-terra-pro, gpt-5.6-luna-pro
MODEL_ALIASES=no user-defined Hermes alias
REASONING_MAPPING=global `agent.reasoning_effort: medium`; no per-model overrides
LOCAL_PROXY_IF_ANY=none
CURRENT_STATUS=ACTIVE; `hermes auth status openai-codex` reported logged in

Actual route:

Hermes CLI
  → native `codex_responses` transport
  → `https://chatgpt.com/backend-api/codex`
  → OpenAI Codex service

Hermes does not route its default model through Codex CLI or either localhost proxy.

CUSTOM PROVIDERS

1. Vultr Inference

DISPLAY_NAME=Vultr Inference
INTERNAL_PROVIDER_ID=custom
BASE_URL_OR_TRANSPORT=https://api.vultrinference.com/v1; OpenAI chat-completions compatible
AUTH_METHOD=*** key from `VULTR_INFERENCE_API_KEY`
DEFAULT_OR_OPTIONAL=OPTIONAL
AVAILABLE_MODELS=11 configured/cached:
- MiniMaxAI/MiniMax-M2.7
- Qwen/Qwen3.5-397B-A17B
- Qwen/Qwen3.6-27B
- deepseek-ai/DeepSeek-V4-Flash
- moonshotai/Kimi-K2.6
- nvidia/DeepSeek-V3.2-NVFP4
- nvidia/Nemotron-3-Nano-Omni-30B-A3B-Reasoning-BF16
- nvidia/Nemotron-Cascade-2-30B-A3B
- vultr/VultronRetrieverCore-Qwen3.5-4.5B
- vultr/VultronRetrieverFlash-Qwen3.5-0.8B
- zai-org/GLM-5.2-FP8
MODEL_ALIASES=none
REASONING_MAPPING=global medium unless transport/model metadata overrides
LOCAL_PROXY_IF_ANY=none
CURRENT_STATUS=AVAILABLE_ON_DEMAND; credential present; not live-probed during final verification

2. Oracle OCI Generative AI

DISPLAY_NAME=Oracle OCI Generative AI
INTERNAL_PROVIDER_ID=custom
BASE_URL_OR_TRANSPORT=https://inference.generativeai.us-chicago-1.oci.oraclecloud.com/20231130/actions/v1
AUTH_METHOD=*** key through `OCI_GENERATIVE_AI_API_KEY`; not standard OCI CLI signing
DEFAULT_OR_OPTIONAL=OPTIONAL
AVAILABLE_MODELS=xai.grok-4.3, xai.grok-4.20-reasoning, xai.grok-4.20-non-reasoning
MODEL_ALIASES=none
REASONING_MAPPING=model names distinguish reasoning/non-reasoning; Hermes global effort is medium
LOCAL_PROXY_IF_ANY=none
CURRENT_STATUS=CONFIGURED_BUT_NOT_RUNNING; credential present; live inference unverified

3. OpenCode Free

DISPLAY_NAME=OpenCode Free
INTERNAL_PROVIDER_ID=custom
BASE_URL_OR_TRANSPORT=http://127.0.0.1:20130/v1; OpenAI chat-completions compatible
AUTH_METHOD=*** upstream; local proxy removes Hermes’ placeholder Authorization header
DEFAULT_OR_OPTIONAL=OPTIONAL
AVAILABLE_MODELS=big-pickle, x-preview-f-free, mimo-v2.5-free, hy3-free, laguna-s-2.1-free, nemotron-3-ultra-free, nemotron-3.5-lightning-free, deepseek-v4-flash-free, muse-spark-1.2-contributor-free
MODEL_ALIASES=`x-preview-f-free` is displayed as `Ox Alpha Free`
REASONING_MAPPING=no config override; `x-preview-f-free` has 1,000,000 configured context and vision support
LOCAL_PROXY_IF_ANY=127.0.0.1:20130
CURRENT_STATUS=ACTIVE AS OPTIONAL SERVICE; HTTP `/v1/models` returned 200

Actual route:

Hermes optional custom provider
  → `127.0.0.1:20130`
  → proxy strips Authorization
  → `https://opencode.ai/zen/v1/...`

AUTHENTICATED PROVIDER INVENTORY

- `openai-codex`: OAuth; active/default; healthy login.
- `kilocode`: API key; optional; doctor connectivity succeeded; 369 cached models.
- `copilot`: GitHub CLI token; optional; 17 cached models; not selected.
- `anthropic`: API-key credential inherited from shell; optional; doctor reported invalid API key. The shell also redirects Anthropic traffic to the local port-8080 proxy.
- No fallback provider chain is configured.

Anthropic cached models: 11 Claude models.
Copilot cached models: 17, including GPT-5.4, GPT-5.x Codex, Claude Sonnet/Haiku and Gemini models.
Kilo cache includes GPT-5.6 Sol and many OpenRouter-style models, but it is not the default route.

ALIASES AND REASONING

- No `model.aliases` or top-level user model aliases were found.
- Built-in Hermes aliases remain available, but none are persisted as user mappings.
- `agent.reasoning_effort: medium`
- No `agent.reasoning_overrides` section.
- Current model context cache:
  `gpt-5.6-sol@https://chatgpt.com/backend-api/codex = 272000`
- Compression for the Codex route is configured for native Codex handling.
- Claude proxy mapping is external to Hermes: every supported Claude model name maps to `qwen.qwen3-coder-next`.

CONFIGURATION ARCHITECTURE

- Primary config: `~/.hermes/config.yaml`
- Config schema/version: 34
- Secrets file: `~/.hermes/.env`, mode 0600
- OAuth/credential pool: `~/.hermes/auth.json`
- User plugin directory: `~/.hermes/plugins`, empty
- `plugins.enabled`: empty list
- `mcp_servers`: one enabled server, `commerce-control`
- terminal backend: `local`
- browser inactivity timeout: 120 seconds
- session DB journal mode: WAL
- user profiles directory: not present
- active profile: root/default Hermes home

Hermes `.env` variable names present:

- BROWSERBASE_ADVANCED_STEALTH
- BROWSERBASE_PROXIES
- BROWSER_INACTIVITY_TIMEOUT
- BROWSER_SESSION_TIMEOUT
- IMAGE_TOOLS_DEBUG
- KILOCODE_API_KEY
- MOA_TOOLS_DEBUG
- OCI_GENERATIVE_AI_API_KEY
- TERMINAL_LIFETIME_SECONDS
- TERMINAL_MODAL_IMAGE
- TERMINAL_TIMEOUT
- VISION_TOOLS_DEBUG
- VULTR_INFERENCE_API_KEY
- WEB_TOOLS_DEBUG

No values were reported.

TOOL CONFIGURATION

Enabled for CLI:

- web
- browser
- terminal
- file
- code_execution
- vision
- image_gen
- bfl
- tts
- skills
- todo
- memory
- session_search
- clarify
- delegation
- cronjob
- computer_use
- commerce-control MCP tool policy: all enabled

Disabled:

- video
- video_gen
- x_search
- stt toolset
- context_engine
- Home Assistant
- Spotify
- Yuanbao

Runtime availability differs from configuration:

- browser-use: doctor says available
- built-in browser/browser-cdp: doctor says dependency not met
- computer_use: configured but doctor says dependency not met
- image_gen: configured but dependency not met
- web: configured but no supported search credential/backend currently available
- local STT is configured true, but faster-whisper is unavailable on this Termux profile

=== PROXIES / LOCAL SERVICES ===

1. OpenCode Free proxy

NAME=OpenCode Free proxy
PURPOSE=Expose anonymous OpenCode Zen free models as a clean local OpenAI-compatible API
PATH=~/.hermes/helpers/opencode-free-proxy.mjs
PORT=20130/TCP, localhost only
AUTOSTART_METHOD=`~/.bashrc` invokes `~/.hermes/helpers/start-opencode-free-proxy.sh`; script uses nohup and PID file
CURRENTLY_RUNNING=YES, PID 18698
UPSTREAM=https://opencode.ai/zen
CONSUMERS=Hermes custom provider `OpenCode Free`
HEALTH_STATUS=HTTP 200 from `/v1/models`

2. Claude-Code/Mantle proxy

NAME=Claude-Code Anthropic-to-Mantle proxy
PURPOSE=Translate Anthropic Messages API requests to an OpenAI-compatible Mantle endpoint
PATH=~/.hermes/claude-code-proxy.py
PORT=8080/TCP, localhost only
AUTOSTART_METHOD=`~/.bashrc` invokes `~/.local/bin/ensure-claude-proxy`; script uses nohup and PID file
CURRENTLY_RUNNING=YES, PID 18892
UPSTREAM=`https://bedrock-mantle.us-east-1.api.aws/v1/chat/completions`
CONSUMERS=Claude Code; potentially Hermes’ optional Anthropic provider because shell exports `ANTHROPIC_BASE_URL=http://127.0.0.1:8080`
MODEL_ROUTE=all mapped Claude names → `qwen.qwen3-coder-next`
HEALTH_STATUS=HTTP 200; proxy log showed successful 200 POST requests during the audit window
LIMITATION=non-streaming only

3. Chromium interactive CDP

NAME=Native Termux Chromium interactive session
PURPOSE=Interactive browser/desktop automation surface
PATH=/data/data/com.termux/files/usr/lib/chromium/chrome
PORT=9223/TCP, localhost only
AUTOSTART_METHOD=no matching shell/service autostart entry found; launch method is manual or helper-driven
CURRENTLY_RUNNING=YES, PID 20629 plus Chromium children
UPSTREAM=websites opened by browser
CONSUMERS=human/browser/CDP tooling; not proven to be the currently configured Hermes browser backend
HEALTH_STATUS=HTTP 200 from `/json/version`
PROFILE=~/.hermes/chrome-interactive

A historical headless Chromium log references port 9222, but port 9222 was not listening at audit completion.

4. ChatGPT Web bridge

NAME=Codex ChatGPT Web bridge
PURPOSE=Support `codex-web`, which starts a bridge then launches Codex with model `chatgpt-web/high`
PATH=/data/data/com.termux/files/usr/bin/chatgpt-bridge
PORT=17841 when active
AUTOSTART_METHOD=started on demand by `/data/data/com.termux/files/usr/bin/codex-web`
CURRENTLY_RUNNING=NO
UPSTREAM=ChatGPT web route, implementation unavailable
CONSUMERS=Codex CLI wrapper
HEALTH_STATUS=unreachable
DRIFT=default source repo `~/projects/codex-chatgpt-web-termux` and `src/cli.ts` are missing; stale PID file remains
CLASSIFICATION=STALE_OR_LEGACY / currently unusable

5. Hermes OpenAI-compatible proxy/API server

- No `hermes proxy`, API server, webhook server or gateway listener was found.
- Gateway status explicitly reports not running.

=== AGENTS / HARNESSES ===

HERMES

NAME=Hermes Agent
INSTALLED=YES
VERSION=0.20.0
PATH=~/.hermes/hermes-agent
AUTH_STATE=*** Codex logged in; optional Kilo/Copilot/Anthropic entries present
MODEL_ROUTE=direct OpenAI Codex backend, gpt-5.6-sol
ROLE=primary local control plane
HOW_HERMES_INTERACTS_WITH_IT=self
ACTIVE_OR_ON_DEMAND=ACTIVE

CODEX CLI

NAME=OpenAI Codex CLI
INSTALLED=YES
VERSION=0.149.0
PATH=~/.local/bin/codex → standalone musl binary
AUTH_STATE=`~/.co...son` exists, mode 0600
MODEL_ROUTE=Codex config selects `gpt-5.6-sol`, reasoning `medium`
ROLE=independent coding harness
HOW_HERMES_INTERACTS_WITH_IT=can launch it through terminal/delegation skills; Hermes’ own default provider does not pass through this CLI
ACTIVE_OR_ON_DEMAND=AVAILABLE_ON_DEMAND

CODEX WEB

NAME=Codex Web wrapper
INSTALLED=launcher only
VERSION=not versioned
PATH=/data/data/com.termux/files/usr/bin/codex-web
AUTH_STATE=***
MODEL_ROUTE=`codex -m chatgpt-web/high` through local bridge
ROLE=alternate Codex web harness
HOW_HERMES_INTERACTS_WITH_IT=terminal launch only
ACTIVE_OR_ON_DEMAND=STALE_OR_LEGACY; bridge source path missing and port stopped

CLAUDE CODE

NAME=Claude Code
INSTALLED=YES, native Termux wrapper plus patched glibc binaries
VERSION=2.1.237 is the current verified usable binary
PATH=~/.local/bin/claude → `/data/data/com.termux/files/usr/bin/claude`
AUTH_STATE=*** local proxy variables, not a valid direct Anthropic credential
MODEL_ROUTE=`sonnet` label → localhost:8080 → Mantle → `qwen.qwen3-coder-next`
ROLE=independent coding harness
HOW_HERMES_INTERACTS_WITH_IT=terminal/delegation skill; no direct core coupling
ACTIVE_OR_ON_DEMAND=AVAILABLE_ON_DEMAND; proxy ACTIVE

GEMINI CLI

NAME=Gemini CLI
INSTALLED=YES
VERSION=0.56.0
PATH=/data/data/com.termux/files/usr/bin/gemini
AUTH_STATE=*** `.env` has `GOOGLE_API_KEY`, `GOOGLE_CLOUD_PROJECT`, and `GOOGLE_CLOUD_LOCATION`; values not inspected
MODEL_ROUTE=Vertex AI; `gemini-3.7-flash`
ROLE=independent full-auto agent harness via shell alias `gemini37`
HOW_HERMES_INTERACTS_WITH_IT=terminal launch only
ACTIVE_OR_ON_DEMAND=AVAILABLE_ON_DEMAND

OPENCODE

NAME=OpenCode CLI
INSTALLED=YES
VERSION=1.17.9
PATH=/data/data/com.termux/files/usr/bin/opencode
AUTH_STATE=*** config contains only OpenCode schema; anonymous free service is used by the separate local proxy
MODEL_ROUTE=CLI route not customized; Hermes optional route uses localhost:20130
ROLE=independent CLI plus upstream service for the Hermes proxy
HOW_HERMES_INTERACTS_WITH_IT=Hermes uses the service through its local proxy, not the CLI binary
ACTIVE_OR_ON_DEMAND=CLI ON_DEMAND; proxy ACTIVE

AGENT ZERO

NAME=Agent Zero
INSTALLED=YES as source checkout and local venv
VERSION=commit `1d8b42bbc95b`, branch `termux-native-nvidia`
PATH=~/projects/agent-zero
AUTH_STATE=*** mode 0600 includes `NVIDIA_NIM_API_KEY`
MODEL_ROUTE=default chat/utility: NVIDIA NIM `nvidia/nemotron-3-ultra-550b-a55b`; embedding: `nvidia/nemotron-3-embed-1b`
ROLE=separate agent runtime/Web UI
HOW_HERMES_INTERACTS_WITH_IT=no direct integration found; human or Hermes terminal can launch `python run_ui.py`
ACTIVE_OR_ON_DEMAND=AVAILABLE_ON_DEMAND; no Agent Zero process or tunnel is running

GITLAB DUO

NAME=GitLab Duo CLI
INSTALLED=YES
VERSION=9.10.0
PATH=/data/data/com.termux/files/usr/bin/duo
AUTH_STATE=*** Duo/GitLab config directory found; UNVERIFIED
MODEL_ROUTE=UNVERIFIED
ROLE=independent coding harness
HOW_HERMES_INTERACTS_WITH_IT=terminal only
ACTIVE_OR_ON_DEMAND=INSTALLED_BUT_NOT_CONFIGURED

ECHO

- No Echo agent CLI, bridge, process, repository or service was found.
- “EchoEe247” appears only as a GitHub owner name and is not evidence of an Echo runtime.
- classification: NOT_FOUND

PLAYWRIGHT

- No global `playwright` executable was found.
- Agent Zero contains Playwright installation support in its own project.
- Hermes doctor reports browser-use available but built-in browser dependency unmet.
- classification for primary Hermes: NOT_FOUND as global harness; browser-use AVAILABLE_ON_DEMAND

=== WORKSPACES / REPOSITORIES ===

1. Hermes Agent

NAME=hermes-agent
PATH=~/.hermes/hermes-agent
ROLE=active primary control-plane source and editable installation
CURRENT_BRANCH=angel/oci-grok420-chat-fix
REMOTE=https://github.com/NousResearch/hermes-agent.git
RELATED_RUNTIME=Hermes PID 19017
STATUS=ACTIVE; dirty/local modifications

2. Memory system

NAME=memory-system
PATH=~/.hermes/memory-system
ROLE=durable Obsidian vault/index helper
CURRENT_BRANCH=main
REMOTE=no origin reported
RELATED_RUNTIME=`~/.hermes/helpers/hermes-vault`
STATUS=ACTIVE ON DEMAND

3. Commerce control plane

NAME=agent-commerce-hub
PATH=~/projects/agent-commerce-hub
ROLE=commerce discovery/control plane and configured Hermes MCP server
CURRENT_BRANCH=feat/hermes-commerce-control-plane
REMOTE=https://github.com/EchoEe247/agent-commerce-hub.git
RELATED_RUNTIME=`tools/hermes-commerce-control/dist/mcp/server.js`
STATUS=CONFIGURED_BUT_NOT_RUNNING; working tree dirty

The stable MCP launcher enforces:

- `COMMERCE_MODE=A`
- external writes disabled
- live value movement disabled
- wallet/signing secret environment variables removed before server execution
- state root `~/.hermes/commerce-control/state`

Additional worktrees/copies:

- `~/agent-commerce-hub`
- `~/agent-commerce-hub-main`

These are separate branches/copies and are not the configured MCP runtime path.

4. Voxel AI game

NAME=voxel-ai-game
PATH=~/projects/voxel-ai-game
ROLE=active game backend/client runtime
CURRENT_BRANCH=feat/v0.1-foundation
REMOTE=https://github.com/EchoEe247/Voxel-ai-game.git
RELATED_RUNTIME=Node/TSX backend and Vite client
STATUS=ACTIVE
PORTS=3001 backend, 5173 frontend

5. Agent Zero

NAME=agent-zero
PATH=~/projects/agent-zero
ROLE=separate agent/Web UI runtime
CURRENT_BRANCH=termux-native-nvidia
REMOTE=https://github.com/agent0ai/agent-zero.git
RELATED_RUNTIME=none currently
STATUS=AVAILABLE_ON_DEMAND / PAUSED

6. Clawcraft

NAME=clawcraft
PATH=~/projects/clawcraft
ROLE=Minecraft/agent/game infrastructure and proving work
CURRENT_BRANCH=angel/bedrock-1.26.50-bringup
REMOTE=https://github.com/VIDGuide/clawcraft.git
RELATED_RUNTIME=no process found
STATUS=PAUSED / AVAILABLE_ON_DEMAND

7. Codex proving/research repositories

- `~/projects/codex-web-frontier-benchmark`
  - branch: master
  - role: seeded-defect proving/benchmark environment
  - status: PAUSED
- `~/projects/codex-web-next-research`
  - branch: empty master with no commit
  - role: research workspace
  - status: INCOMPLETE / PAUSED
- staging and verification copies under `~/projects/staging`
  - status: LEGACY/PROVING ARTIFACTS

8. llama.cpp

NAME=llama.cpp
PATH=~/llama.cpp
ROLE=local LLM build/serving source
CURRENT_BRANCH=master
REMOTE=https://github.com/ggml-org/llama.cpp
RELATED_RUNTIME=no llama server/process found
STATUS=AVAILABLE_ON_DEMAND

9. VoxeLibre runtime data

PATH=~/ai_colony/runtime/luanti/games/voxelibre
ROLE=Luanti/VoxeLibre game content
CURRENT_BRANCH=master
REMOTE=https://git.minetest.land/VoxeLibre/VoxeLibre.git
RELATED_RUNTIME=no Luanti process found
STATUS=PAUSED

No active social runtime was found.

=== CLOUD / REMOTE INFRASTRUCTURE ===

GITHUB

PLATFORM=GitHub
AUTH_CONFIGURED=*** through `gh`
CLI_INSTALLED=YES, gh 2.97.0
ACTIVE_RESOURCES_VISIBLE=authenticated account and repository remotes; no broad resource enumeration performed
ROLE=source control and repository transport
HOW_HERMES_ACCESSES_IT=gh CLI and git through local terminal/tools
STATUS=ACTIVE

ORACLE CLOUD

PLATFORM=Oracle OCI Generative AI
AUTH_CONFIGURED=*** for the custom API provider
CLI_INSTALLED=NO
ACTIVE_RESOURCES_VISIBLE=not safely enumerable without OCI CLI/standard account configuration
ROLE=optional Grok inference endpoint
HOW_HERMES_ACCESSES_IT=direct HTTPS custom-provider route
STATUS=AVAILABLE_ON_DEMAND; live inference UNVERIFIED

VULTR

PLATFORM=Vultr Inference
AUTH_CONFIGURED=***
CLI_INSTALLED=NO
ACTIVE_RESOURCES_VISIBLE=not enumerated
ROLE=optional model inference
HOW_HERMES_ACCESSES_IT=direct HTTPS custom-provider route
STATUS=AVAILABLE_ON_DEMAND

GOOGLE CLOUD / VERTEX

PLATFORM=Google Cloud Vertex AI
AUTH_CONFIGURED=*** inside Gemini CLI configuration
CLI_INSTALLED=`gcloud` not installed
ACTIVE_RESOURCES_VISIBLE=not enumerated
ROLE=Gemini CLI inference route
HOW_HERMES_ACCESSES_IT=only by launching Gemini CLI; not the active Hermes model provider
STATUS=AVAILABLE_ON_DEMAND

AWS / BEDROCK MANTLE

PLATFORM=AWS-hosted Mantle endpoint
AUTH_CONFIGURED=*** inside the local Claude proxy implementation
CLI_INSTALLED=AWS CLI/config not found
ACTIVE_RESOURCES_VISIBLE=not enumerable
ROLE=upstream for Claude-Code compatibility proxy
HOW_HERMES_ACCESSES_IT=indirectly if Claude Code is launched
STATUS=PROXY ACTIVE; no general AWS control-plane access established

CLOUDFLARE

PLATFORM=Cloudflare
AUTH_CONFIGURED=*** evidence
CLI_INSTALLED=wrangler and cloudflared not found
ACTIVE_RESOURCES_VISIBLE=none
ROLE=skills and Agent Zero source support exist, but no active tunnel/runtime
HOW_HERMES_ACCESSES_IT=no active path
STATUS=NOT_FOUND as live integration; source-level capability only

RENDER

- CLI/config/runtime: NOT_FOUND

DIGITALOCEAN

- `doctl`, config and runtime: NOT_FOUND

AZURE

- `az`, config and runtime: NOT_FOUND

TELEGRAM AND OTHER GATEWAY PLATFORMS

- Telegram token/config: not present
- Gateway: stopped
- Gateway routing rows: zero
- Discord package: not installed
- No WhatsApp, Slack, Teams, Telegram or other messaging process found
- status: NOT_CONFIGURED / NOT_RUNNING

No cloud/server-hosted Hermes instance was found.

=== ACTIVE PROCESSES / PORTS ===

1. Hermes CLI

PROCESS/SERVICE=Hermes Agent CLI
PID=19017
LISTENING_PORT=none
COMMAND_OR_SCRIPT=venv Python running Hermes entry point
ROLE=primary control plane
PARENT/LAUNCH_METHOD=PID 18978, interactive Termux login shell; manual launch
HEALTH_STATUS=active; version and DB checks succeeded

2. OpenCode Free proxy

PID=18698
PORT=127.0.0.1:20130
COMMAND=node ~/.hermes/helpers/opencode-free-proxy.mjs
ROLE=optional Hermes model proxy
PARENT/LAUNCH_METHOD=PID 1 after nohup; `.bashrc` startup helper
HEALTH_STATUS=HTTP 200

3. Claude-Code proxy

PID=18892
PORT=127.0.0.1:8080
COMMAND=python3 ~/.hermes/claude-code-proxy.py 8080
ROLE=Anthropic-to-Mantle/Qwen compatibility proxy
PARENT/LAUNCH_METHOD=PID 1 after nohup; `.bashrc` startup helper
HEALTH_STATUS=HTTP 200; successful proxy POSTs observed

4. Chromium interactive

PID=20629 plus children
PORT=127.0.0.1:9223
COMMAND=Termux Chromium with `--remote-debugging-port=9223`
ROLE=interactive browser/CDP runtime
PARENT/LAUNCH_METHOD=PID 1; exact launcher not found
HEALTH_STATUS=HTTP 200 from `/json/version`

5. Voxel backend

PID=10870, watcher parent 10859
PORT=127.0.0.1:3001
COMMAND=TSX watch `server/src/main.ts`
ROLE=voxel game server
PARENT/LAUNCH_METHOD=detached `bash -lic`/npm development command
HEALTH_STATUS=`/health` returned 200

6. Voxel frontend

PID=10902
PORT=127.0.0.1:5173
COMMAND=Vite
ROLE=voxel game client
PARENT/LAUNCH_METHOD=detached `bash -lic`/npm development command
HEALTH_STATUS=HTTP 200

7. Termux X11

PID=10543
PORT=not TCP-observed
ROLE=Android/Termux graphical display surface
STATUS=ACTIVE

Not running:

- Hermes gateway
- Hermes proxy/API/webhook server
- Hermes cron scheduler jobs
- commerce-control MCP server
- Agent Zero
- ChatGPT Web bridge
- Ubuntu Hermes
- cloudflared
- Playwright
- llama.cpp server
- Luanti game
- messaging gateways

Android’s `ss`, `netstat` and `lsof` did not expose listening sockets in this app context. Ports above were established through process arguments, logs and direct localhost HTTP probes.

=== MEMORY / STATE ===

PRIMARY SESSION/STATE STORE

- Path: `~/.hermes/state.db`
- SQLite WAL mode
- Approximate logical size at doctor run: 155.7 MB
- WAL: approximately 3.9 MB
- Sessions: 132
- Messages: approximately 24,148 at doctor run
- FTS:
  - `messages_fts`
  - `messages_fts_trigram`
- One process held the database open: the active Hermes CLI.
- The DB also stores:
  - system prompts;
  - session model usage;
  - asynchronous delegations;
  - gateway routing;
  - state metadata.

HOT MEMORY

- `~/.hermes/memories/MEMORY.md`
  - 2,148 bytes
  - mode 0600
- `~/.hermes/memories/USER.md`
  - 151 bytes
  - mode 0600
- `~/.hermes/SOUL.md`
  - 5,404 bytes
  - mode 0600
- Built-in memory provider is active.
- No external Hermes memory provider is configured.

DURABLE OBSIDIAN MEMORY VAULT

- Vault:
  `/storage/emulated/0/Documents/Hermes-memory-storage`
- Index:
  `~/.hermes/memory-index.sqlite`
- Indexed notes: 23
- Index tables include `notes` and `notes_fts`.
- Access path:
  `~/.hermes/helpers/hermes-vault`
- Purpose: durable project state, decisions, procedures, learnings and receipts.

OTHER STATE

- Verification evidence:
  `~/.hermes/verification_evidence.db`
- Commerce state, current configured root:
  `~/.hermes/commerce-control/state/state.db`
- Older alternate commerce DB:
  `~/.hermes/commerce-control/state.db`
- Sessions/request dumps:
  `~/.hermes/sessions`
- Logs:
  `~/.hermes/logs`
- Skills:
  `~/.hermes/skills`
- Cron:
  `~/.hermes/cron`; no jobs
- Process registry:
  `~/.hermes/processes.json`; effectively empty
- OAuth/provider credentials:
  `~/.hermes/auth.json`
- Model/provider caches:
  - `~/.hermes/provider_models_cache.json`
  - `~/.hermes/models_dev_cache.json`
  - `~/.hermes/cache/model_catalog.json`
  - `~/.hermes/ollama_cloud_models_cache.json`
  - `~/.hermes/context_length_cache.yaml`

BACKUPS

Present backup families include:

- OpenCode Free configuration backups
- pre-native-Codex backup
- Ox Alpha/reasoning backups
- memory-system backups
- Hermes update backups
- local patch backups
- pre-Ubuntu Hermes source backup
- Ubuntu-copy source backup

CONFIGURATION PERSISTENCE

- settings: `~/.hermes/config.yaml`
- secrets: `~/.hermes/.env`
- credentials/OAuth: `~/.hermes/auth.json`
- shell-level route/autostart settings: `~/.bashrc`

=== STARTUP CHAIN ===

Verified chain:

Termux opens an interactive login shell
  → `/data/data/com.termux/files/usr/etc/profile`
  → Termux profile explicitly sources `~/.bashrc`
  → `~/.bashrc` adds `~/.local/bin` to PATH
  → defines Ubuntu/PRoot aliases
  → exports Claude proxy route:
      `ANTHROPIC_BASE_URL=http://127.0.0.1:8080`
  → invokes `~/.local/bin/ensure-claude-proxy`
  → invokes `~/.hermes/helpers/start-opencode-free-proxy.sh`
  → defines the `hermes()` shell function
  → no automatic Hermes launch
  → human runs `hermes`
  → `ensure-hermes-local-patches.sh` checks/reapplies the local MoA inventory patch if necessary
  → shell function invokes `/data/data/com.termux/files/usr/bin/hermes`
  → launcher executes `~/.hermes/hermes-agent/venv/bin/hermes`
  → interactive Hermes CLI starts

Not part of startup:

- gateway
- cron jobs
- commerce MCP persistent service
- Agent Zero
- Ubuntu Hermes
- ChatGPT Web bridge
- Telegram
- cloud tunnels

Termux service definitions exist for X11, SSH and CUPS, but no Hermes/proxy service definition was found. No Termux boot script, systemd unit or supervisor configuration was found for Hermes.

=== ARCHITECTURE GRAPH ===

Human
  │
  └── Native Termux shell on Android
        │
        ├── ~/.bashrc
        │     ├── Claude proxy :8080
        │     │     └── AWS-hosted Mantle
        │     │           └── qwen.qwen3-coder-next
        │     ├── OpenCode Free proxy :20130
        │     │     └── opencode.ai/zen
        │     └── Hermes launch guard/local MoA patch
        │
        ├── Hermes Agent CLI [PRIMARY, PID 19017]
        │     ├── DEFAULT:
        │     │     openai-codex / gpt-5.6-sol
        │     │       └── direct Codex Responses API
        │     │           └── chatgpt.com/backend-api/codex
        │     ├── OPTIONAL:
        │     │     ├── Vultr Inference
        │     │     ├── Oracle OCI Generative AI
        │     │     ├── Kilo Code
        │     │     ├── GitHub Copilot
        │     │     ├── Anthropic route [currently unhealthy]
        │     │     └── OpenCode Free via localhost:20130
        │     ├── Local shell/files/code execution
        │     ├── Git/GitHub
        │     ├── Skills and delegation
        │     ├── state.db + hot memory
        │     ├── Obsidian durable-memory vault
        │     └── commerce-control MCP [configured, not running]
        │
        ├── Independent harnesses
        │     ├── Codex CLI [on demand]
        │     ├── Claude Code [on demand; proxy active]
        │     ├── Gemini CLI → Vertex AI [on demand]
        │     ├── OpenCode CLI [on demand]
        │     ├── GitLab Duo [installed, auth unknown]
        │     ├── Agent Zero → NVIDIA NIM [paused/on demand]
        │     └── Codex Web bridge [stale/broken]
        │
        ├── Active local runtimes
        │     ├── Chromium CDP :9223
        │     ├── Voxel server :3001
        │     └── Voxel client :5173
        │
        └── PRoot distributions
              ├── hermes-ubuntu
              │     └── Hermes 0.20.0 → Vultr MiniMax
              │         [installed, not running]
              └── debian
                    └── no independent Hermes installation

=== ARCHITECTURE_DRIFT ===

1. PRIMARY HERMES IS LOCALLY MODIFIED

Evidence:

- current branch is `angel/oci-grok420-chat-fix`, not upstream main;
- multiple core/provider/test files are modified;
- `hermes_cli/inventory.py` has a local MoA patch;
- `~/.bashrc` runs an automatic local patch guard before every Hermes launch.

Confidence: HIGH

Effect: runtime behavior may differ from stock Hermes 0.20.0.

2. DUPLICATE/OLD HERMES TREES REMAIN

Evidence:

- full Ubuntu/PRoot installation;
- two old source backup trees at commit `8f2712725af7`;
- current native source checkout;
- shell aliases still expose Ubuntu Hermes.

Confidence: HIGH

Classification: Ubuntu is available on demand but secondary; backup trees are legacy.

3. ANTHROPIC PROVIDER NAME DOES NOT REPRESENT THE REAL ROUTE

Evidence:

- shell exports `ANTHROPIC_BASE_URL=http://127.0.0.1:8080`;
- local service translates Anthropic requests to a Mantle OpenAI endpoint;
- all Claude model names map to `qwen.qwen3-coder-next`;
- Hermes doctor reported the optional Anthropic credential unhealthy.

Confidence: HIGH

Effect: “Claude/Sonnet” labels do not imply Anthropic-hosted Claude inference in this shell.

4. HARDCODED CREDENTIAL MATERIAL EXISTS IN THE CLAUDE PROXY SOURCE

Evidence:

- `~/.hermes/claude-code-proxy.py` contains embedded credential material used for its upstream request.

The value is intentionally omitted.

Confidence: HIGH

Classification: security/configuration drift; credentials are normally expected in a protected secret store, not source code.

5. CLAUDE WRAPPER AUTO-UPDATE CONFLICT

Evidence:

- Claude settings specify `autoUpdates: false`;
- `/usr/bin/claude` independently performs a daily release check/download before launching.

During this audit, a version query invoked the wrapper, which unexpectedly triggered its updater. It created/updated:

- `.last-update-check`
- `.update.lock`
- a `2.1.239...tmp` staging file of approximately 340 MB

The updater process had exited by final verification, leaving the lock/temp state. These files were not removed because this audit prohibited repairs.

Confidence: HIGH

This was an unintended inspection side effect and is disclosed explicitly.

6. CODEX WEB LAUNCHER IS STALE/BROKEN

Evidence:

- `codex-web` and `chatgpt-bridge` launchers exist;
- bridge port 17841 is stopped;
- stale PID file exists;
- default repo `~/projects/codex-chatgpt-web-termux` and required `src/cli.ts` do not exist;
- no environment override redirects the missing path.

Confidence: HIGH

7. BROWSER CONFIGURATION AND RUNTIME DO NOT ALIGN

Evidence:

- `hermes tools list` says browser and computer-use enabled;
- doctor reports built-in browser/browser-cdp/computer-use dependencies unmet;
- browser-use is available;
- a separate Chromium CDP process is active on 9223;
- no proof links that Chromium process to the configured Hermes browser backend.

Confidence: HIGH

8. COMMERCE MCP IS ENABLED BUT ABSENT FROM CURRENT RUNTIME

Evidence:

- `mcp_servers.commerce-control.enabled: true`;
- `hermes mcp list` reports it enabled;
- no commerce MCP Node process exists;
- active tool inventory supplied to this session contains no commerce MCP functions.

Confidence: HIGH for current non-running state; cause UNVERIFIED.

9. TWO COMMERCE DATABASE ROOTS EXIST

Evidence:

- `~/.hermes/commerce-control/state.db`, approximately 2.4 MB;
- `~/.hermes/commerce-control/state/state.db`, approximately 67.5 MB;
- MCP launcher explicitly selects the latter state directory.

Confidence: HIGH

Classification: first DB is likely superseded or from an older layout; not modified.

10. OLD CONFIGURATION BACKUPS ARE NUMEROUS

Evidence:

- multiple dated OpenCode, Codex, Ox Alpha, Ubuntu and memory backup directories.

Confidence: HIGH

These are not active config, but searching without respecting precedence can produce conflicting historical architecture descriptions.

11. OPENCODE PROXY LOG CONTAINS MANY REPEATED START BANNERS

Evidence:

- the log contains repeated “listening” entries;
- only one current proxy process exists.

Confidence: HIGH

Interpretation: repeated historical shell starts, not current duplicate listeners.

12. `.bashrc` STILL DESCRIBES IMPORTED UBUNTU CONFIGURATION

Evidence:

- comments say Claude configuration was “migrated from hermes-ubuntu”;
- the active implementation is now native Termux.

Confidence: HIGH

The comments are historical context, not current runtime placement.

=== UNVERIFIED ===

- Whether any Hermes cloud/server instance exists outside this device and outside locally configured accounts.
- Live inference success for Vultr and Oracle custom providers.
- Current Gemini/Vertex API usability; configuration and credential presence are proven, but no model call was made.
- GitLab Duo login state and model route.
- Why the enabled commerce MCP did not attach to the active Hermes process.
- Whether the current Chromium process was launched manually or by a browser helper.
- Any unobserved Android listening sockets; standard socket-listing commands returned no entries, so known endpoints were verified individually.
- Remote Cloudflare, Render, DigitalOcean, Azure or OCI account resources; no corresponding authenticated CLI/configuration was available.
- Browser-use’s exact remote/local engine for a future call.
- Whether the older alternate commerce DB still has any external consumer.

=== CANONICAL MEMORY SNAPSHOT ===

At 2026-08-21T22:59:30-05:00, the primary Hermes control plane is the native Termux installation on a Google Pixel 6a running Android 17/aarch64. `$HOME` is `/data/data/com.termux/files/home`; Hermes home is `~/.hermes`; the launcher is `$PREFIX/bin/hermes`; and the active editable Git/venv installation is `~/.hermes/hermes-agent`, Hermes 0.20.0 using Python 3.11.15. The active checkout is locally modified on branch `angel/oci-grok420-chat-fix`, and a shell launch guard maintains a local MoA inventory patch.

The active Hermes process is an interactive CLI, not a gateway or server. It is launched manually from Termux after `/etc/profile` sources `~/.bashrc`. No Hermes gateway, Telegram or other messaging channel, API server, webhook server or cron job is running. No remote/cloud Hermes instance was found.

Hermes’ current/default model route is direct:
Hermes → native Codex Responses transport → `https://chatgpt.com/backend-api/codex` → `openai-codex/gpt-5.6-sol`, authenticated by stored OAuth device-code credentials. Reasoning effort is globally `medium`; no user model aliases, per-model reasoning overrides or fallback chain are configured.

Optional Hermes provider routes are:

- Vultr Inference, direct HTTPS with an API key, 11 configured models, available on demand.
- Oracle OCI Generative AI, direct HTTPS custom endpoint with an API key, Grok 4.3/4.20 models, configured but not live-verified.
- Kilo Code, API-key authenticated and connectivity-validated, optional.
- GitHub Copilot, authenticated through the GitHub CLI token, optional.
- Anthropic, configured from shell environment but currently unhealthy and redirected to a local compatibility proxy rather than direct Anthropic.
- OpenCode Free, active through a localhost proxy on port 20130.

Two local helper proxies autostart from `~/.bashrc`:

- `127.0.0.1:20130`: OpenCode Free OpenAI-compatible proxy. It strips Authorization and forwards to `opencode.ai/zen`. It is active and is an optional Hermes custom provider.
- `127.0.0.1:8080`: Anthropic Messages-to-Mantle proxy used by Claude Code. All Claude model labels map to `qwen.qwen3-coder-next`; therefore Claude/Sonnet labels in this shell do not imply Anthropic-hosted inference. The proxy is active. Its source contains embedded upstream credential material, which is architectural/security drift.

The Ubuntu/PRoot installation still exists at `/usr/local/lib/hermes-agent` inside `hermes-ubuntu`, also version 0.20.0. It has its own `/root/.hermes/config.yaml` and state database and defaults to Vultr `MiniMaxAI/MiniMax-M2.7`. It is not running. Its actual role is secondary/available-on-demand through shell aliases, not the primary control plane. A Debian PRoot exists but has no independent Hermes home; its `hermes` resolution is the bind-mounted native Termux launcher. Two older Hermes source backup trees also remain and are legacy.

Connected/usable independent harnesses are:

- Codex CLI 0.149.0, authenticated, configured for `gpt-5.6-sol` with medium reasoning; on demand. Hermes’ own model route does not pass through this CLI.
- Claude Code 2.1.237; on demand through the active local Mantle/Qwen proxy.
- Gemini CLI 0.56.0; configured for Vertex AI `gemini-3.7-flash`; on demand.
- OpenCode CLI 1.17.9; on demand; separate from the active OpenCode Free proxy.
- GitLab Duo CLI 9.10.0; installed, auth/model route unverified.
- Agent Zero source checkout; not running; configured by default for NVIDIA NIM Nemotron chat/utility/embedding models.
- Codex Web launcher; stale/broken because its required bridge source repo is missing.
- Echo runtime: not found.

The configured Hermes MCP integration is `commerce-control`, launched from `~/projects/agent-commerce-hub`. Its launcher enforces Mode A, disables external writes and live value movement, removes wallet/signing secrets and selects `~/.hermes/commerce-control/state` as state root. It is configured but no MCP server process or MCP tools are active in the current session.

Important repositories are:

- `~/.hermes/hermes-agent`: active primary control plane.
- `~/.hermes/memory-system`: active-on-demand durable vault helper.
- `~/projects/agent-commerce-hub`: commerce control-plane/MCP source; configured but server stopped.
- `~/projects/voxel-ai-game`: active backend on port 3001 and Vite client on 5173.
- `~/projects/agent-zero`: paused/on-demand separate agent runtime.
- `~/projects/clawcraft`: paused game/agent infrastructure.
- Codex benchmark/research workspaces: paused proving environments.
- `~/llama.cpp` and VoxeLibre/Luanti content: present but not running.

Cloud access architecture is limited and route-specific:

- GitHub is actively authenticated through `gh` and used for Git/remotes.
- Vultr and Oracle are optional direct Hermes inference endpoints.
- Google Vertex is configured only through Gemini CLI.
- The AWS-hosted Mantle endpoint is reachable only through the Claude proxy; no general AWS CLI control plane was found.
- Cloudflare, Render, DigitalOcean and Azure CLIs/auth/runtimes were not found.
- No cloudflared tunnel is active.

Persistent state architecture:

- `~/.hermes/state.db` is the canonical SQLite/WAL session store, with 132 sessions and about 24,000 messages at audit time, plus FTS indexes, model usage, delegations and routing state.
- Hot memory is `~/.hermes/memories/MEMORY.md` and `USER.md`; persona is `~/.hermes/SOUL.md`.
- Durable project memory is an Obsidian vault at `/storage/emulated/0/Documents/Hermes-memory-storage`, indexed by `~/.hermes/memory-index.sqlite` and accessed through `~/.hermes/helpers/hermes-vault`.
- Credentials/OAuth are in `~/.hermes/auth.json`; secrets are in `~/.hermes/.env`; configuration is in `~/.hermes/config.yaml`.
- Provider/model caches, logs, sessions, verification evidence, commerce state and multiple dated backups remain under `~/.hermes`.

Active components at audit time:

- Native Termux Hermes CLI
- OpenAI Codex direct model route
- OpenCode Free proxy
- Claude/Mantle proxy
- Chromium CDP on 9223
- GitHub integration
- voxel backend/client
- built-in state and memory systems

Available on demand:

- Ubuntu Hermes
- Codex CLI
- Claude Code
- Gemini CLI
- OpenCode CLI
- Agent Zero
- Vultr/Oracle/Kilo/Copilot optional provider routes
- llama.cpp and game/agent repositories

Paused, stopped or legacy:

- Hermes gateway and messaging channels
- commerce MCP subprocess
- Codex Web bridge
- Clawcraft, Luanti and proving workspaces
- old Hermes source trees and configuration backups
- alternate older commerce database
- any cloud/server Hermes role

AUDIT_COMPLETE=YES
