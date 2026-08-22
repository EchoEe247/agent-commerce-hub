# Agent Zero Repair and Subagent Validation — 2026-08-22

Repository under test: `/data/data/com.termux/files/home/projects/agent-zero`
Starting validated identity: branch `termux-native-nvidia`, commit `1d8b42bbc95b51657d00fdc10dc2cd58a6788a15`
Repair branch: `angel/agent-zero-readiness-20260822`
Post-repair commit: `1e1ed797a6e8e06fad0cc2f70d5a77909d13fbf0`

=== BEFORE STATE ===

- The validated PR #34 architecture handoff was used as the baseline; the architecture audit was not repeated.
- Baseline repo identity matched `EchoEe247/agent-zero`, branch `termux-native-nvidia`, commit `1d8b42bbc95b51657d00fdc10dc2cd58a6788a15`.
- Tracked worktree was clean. The same 19 legacy/untracked entries identified by the audit were preserved.
- Agent Zero was running on `127.0.0.1:5000`; `/api/health` returned 200.
- Historical evidence contained an approximately 110 MB log and approximately 310,000 Python 3.14/nest_asyncio exceptions. The historical audit had observed about 27% apparent idle CPU.
- The historical exception storm was not active in the first fresh process inspected. The branch already contained the Python 3.14 no-nest_asyncio compatibility correction and regression test.
- Browser plugin was disabled (`.toggle-0`), Python Patchright/browser cache was unavailable, ports 9222/9223 were closed, and Termux:X11 was down.
- NVIDIA primary/utility and embedding routes were configured but had not previously been authenticated by the architecture audit.

BASELINE_AGENT_ZERO_STATE=RUNNING_PID_9773_AT_INITIAL_INSPECTION
BASELINE_HEALTH=HTTP_200
BASELINE_IDLE_CPU=HISTORICAL_~27_PERCENT;_FRESH_PRE_REPAIR_PROCESS_DID_NOT_SHOW_ERROR_STORM
BASELINE_BROWSER=DISABLED_NO_PATCHRIGHT_NO_CDP_NO_X11
BASELINE_MODEL_ROUTE=NVIDIA_NIM_CONFIGURED_NOT_PREVIOUSLY_AUTHENTICATED

=== ROOT CAUSES ===

1. Historical Python 3.14 storm: global `nest_asyncio` patching was incompatible with Python 3.14 task bookkeeping. The validated base branch had already removed startup patching and included `tests/test_python314_asyncio_compat.py`; the storm did not recur during this repair.
2. Current sustained idle CPU reproduced independently after the functional work: four watchdog polling emitter threads recursively rescanned four watched roots every one second on native Android/Termux. A Python all-thread stack dump showed all four in `watchdog/observers/polling.py:queue_events`. A 180-second pre-fix sample had median 10.898%, mean 10.699%, max 11.899%, with 15/18 samples above 10%.
3. Browser unavailability: Agent Zero assumed its Docker/Patchright runtime. Native Termux already had a proven Node Playwright core and `headless_shell`, but Agent Zero had no adapter to use them.
4. Browser backend normalization initially rejected the new `termux_native` value and silently selected `container`; a focused red test reproduced this before the config fix.
5. Browser bridge lifecycle: after launching a page, closing the Python-side stdin left the Node bridge and browser alive. A focused red integration test reproduced the hang before adding EOF cleanup.

=== FILES CHANGED ===

Intentional Agent Zero changes only:

- `helpers/watchdog.py`
- `plugins/_browser/.toggle-0` renamed to `plugins/_browser/.toggle-1`
- `plugins/_browser/default_config.yaml`
- `plugins/_browser/helpers/config.py`
- `plugins/_browser/helpers/selector.py`
- `plugins/_browser/helpers/termux_runtime.py` (new)
- `plugins/_browser/assets/termux-playwright-bridge.cjs` (new)
- `scripts/termux/agent-zero`
- `tests/test_termux_browser_runtime.py` (new)
- `tests/test_termux_watchdog_polling.py` (new)

Commits:

- `b5d90321f3ad71375d93cdb691db6c48c01f9909` — native Termux browser runtime
- `b7df7b61b39b4010e2103612ec34f2b282db7ce7` — bridge cleanup on parent exit
- `1e1ed797a6e8e06fad0cc2f70d5a77909d13fbf0` — lower-frequency native-Termux watchdog polling

No credentials, `.env`, chats, browser profiles, or legacy backup artifacts were committed or removed.

=== CPU FIX ===

CPU_PROBLEM_REPRODUCED=YES
CPU_ROOT_CAUSE=WATCHDOG_POLLING_OBSERVER_RECURSIVE_SCANS_EVERY_1_SECOND_ON_FOUR_ROOTS

Fix: preserve native filesystem observer defaults everywhere else; on native Termux instantiate the polling observer with a 5-second interval. This retains change detection while removing sustained idle scanning pressure.

Focused TDD:

- Red: native-Termux observer test expected `timeout=5.0`, observed default constructor.
- Green: `tests/test_termux_watchdog_polling.py` passed.
- Surrounding watcher/plugin activation tests passed.

Post-fix clean restart, 20-second warmup plus 180-second idle sample:

`[2.800, 2.200, 2.500, 3.899, 2.600, 4.199, 4.099, 2.600, 2.300, 2.500, 2.500, 2.900, 3.800, 2.200, 2.300, 3.399, 2.300, 2.900]`

Median=2.600%; mean=2.889%; max=4.199%; samples above 10%=0/18.

No repeating exception storm appeared in the final process output.
CPU_READY=YES

=== NVIDIA INFERENCE PROOF ===

Provider/model inspected immediately before the authenticated call:

- provider: `nvidia_nim`
- model: `nvidia/nemotron-3-ultra-550b-a55b`
- adapter endpoint: NVIDIA NIM default (`https://integrate.api.nvidia.com/v1`); local `api_base` override was blank.

Bounded primary reasoning input used alpha/beta/gamma quantities and prices. Independently calculated expected output:

```json
{"total_quantity":13,"total_value":75,"highest_line_value_item":"beta"}
```

Fresh authenticated response exactly matched that JSON. No key was printed.

The utility route used the same configured NVIDIA provider/model and separately returned the correct descending sequence `[3,2,1]` and sum `6`.

PRIMARY_INFERENCE=PASS
UTILITY_ROUTE=PASS

=== EMBEDDING PROOF ===

Configured route: `nvidia_nim` / `nvidia/nemotron-3-embed-1b`.

Two distinct strings were embedded through Agent Zero's configured embedding model wrapper. Results:

- request succeeded;
- vector count: 2;
- dimensions: 2048 and 2048;
- all values numeric;
- both vectors non-empty;
- vectors were distinct.

Full vectors and credentials were not printed or stored.

EMBEDDING_INFERENCE=PASS

=== BROWSER ARCHITECTURE AFTER FIX ===

BROWSER_AUTOMATION_READY=YES
BROWSER_METHOD=AGENT_ZERO_BROWSER_TOOL_TO_PYTHON_LINE_JSON_BRIDGE_TO_NODE_PLAYWRIGHT_CORE_TO_NATIVE_TERMUX_HEADLESS_SHELL
BROWSER_BINARY=/data/data/com.termux/files/usr/bin/headless_shell
PLAYWRIGHT_CORE=REUSED_FROM_EXISTING_VOXEL_NODE_TOOLCHAIN
CDP_ENDPOINT=NOT_USED
TERMUX_X11=NOT_REQUIRED
PATCHRIGHT=NOT_USED

The canonical Termux launcher discovers an existing Playwright core package and exports `A0_TERMUX_PLAYWRIGHT_CORE`; it does not download another Chromium bundle. Default `container` behavior remains unchanged off Termux. Bridge EOF cleanup prevents orphaned Node/browser processes.

=== BROWSER ACCEPTANCE ===

A real Agent Zero task—not Hermes manual browsing—used Agent Zero's `browser` tool to:

1. open `http://127.0.0.1:8765`;
2. read `READY_NONCE_A0_826`;
3. click `Change state`;
4. read `CHANGED_NONCE_A0_826`;
5. save a screenshot;
6. close all browser pages.

API task status=200; latency=115.888 seconds; Agent Zero returned `pass: true`.

Screenshot evidence: `/data/data/com.termux/files/home/tmp/agent-zero-browser-validation/final-agent-zero-task.jpg`, 15,559 bytes, SHA-256 `39e8e425b8dab77256819d3349c9b002e4a2b09373dfcae1c197a78df806b74d`. Independent visual inspection confirmed the ready nonce, button label, and changed nonce.

BROWSER_ACCEPTANCE=PASS

=== HERMES DELEGATION TEST ===

Hermes used the canonical absolute launcher `/data/data/com.termux/files/home/bin/agent-zero`.

- stopped process: launcher started Agent Zero;
- healthy process: launcher returned `AGENT_ZERO_ALREADY_RUNNING` and did not create a duplicate;
- launcher health target: `http://127.0.0.1:5000/api/health`;
- supported local task path: authenticated `POST /api/api_message`;
- real task results were obtained for browser acceptance and subagent orchestration;
- final health reported exact branch `angel/agent-zero-readiness-20260822` and commit `1e1ed797a6e8e06fad0cc2f70d5a77909d13fbf0`.

HERMES_DELEGATION_READY=YES

=== AGENT ZERO SUBAGENT TEST ===

SUBAGENTS_REQUESTED=4
SUBAGENTS_STARTED=4
SUBAGENTS_COMPLETED=4_INCLUDING_EXPECTED_BLOCKED_D
SUBAGENTS_CORRECT=4
SUBAGENTS_FAILED=1_EXPECTED_NEGATIVE_D
PARALLEL_EXECUTION=YES_AGENT_ZERO_PARALLEL_TOOL_WITH_THREE_DISTINCT_CALL_SUBORDINATE_CALLS
ARTIFACT_VALIDATION=PASS
PARENT_AGGREGATION=PASS
FAILURE_PROPAGATION=PASS
AGENT_ZERO_HEALTH_AFTER_TEST=PASS

SUBAGENT_A_TASK=Inspect a defect-planted Python module against its embedded specification; identify defects, consequences, evidence, and minimal patch text.
SUBAGENT_A_RESULT=Found exactly `eligible` boundary `>` vs `>=`, accumulator `1` vs `0`, and `tax_rate` vs `unit_price`; continued original child context `ooUxBdiS` to add all three requested minimal patches.
SUBAGENT_A_GROUND_TRUTH=The same three planted defects and no others.
SUBAGENT_A_VERDICT=PASS

SUBAGENT_B_TASK=Analyze the complete CSV; compute totals, largest service, anomaly, and exact nonce.
SUBAGENT_B_RESULT=alpha=77, beta=148, gamma=2102; largest=gamma; anomaly event 19/value 2000; nonce `NONCE-SUB-B-826-XQ7`.
SUBAGENT_B_GROUND_TRUTH=Exact match to independent Python calculation.
SUBAGENT_B_VERDICT=PASS

SUBAGENT_C_TASK=Compare expected/actual configurations; separate four material mismatches from one harmless difference.
SUBAGENT_C_RESULT=Material: `server.port`, `model.name`, missing `browser.enabled`, `browser.binary`; harmless: `log_level`.
SUBAGENT_C_GROUND_TRUTH=Exact match.
SUBAGENT_C_VERDICT=PASS

SUBAGENT_D_NEGATIVE_TEST=Analyze intentionally absent `intentionally-missing-input.txt`.
SUBAGENT_D_RESULT=`{"agent":"D","status":"blocked","error":"INPUT_NOT_FOUND"}`; no contents invented.
SUBAGENT_D_VERDICT=PASS

Parent `parent-summary.json` exactly incorporated updated A, B, C and D, listed A/B/C completed, and listed D in `failed_subagents` as the expected negative test. All five JSON artifacts parsed and independently matched ground truth. Agent Zero remained healthy.

=== VOXEL INSPECTION READINESS ===

The Voxel frontend was not already running (`127.0.0.1:5173` closed), so no live Voxel page inspection was fabricated or expanded into a Voxel debugging task. No Voxel source was modified. The browser integration deliberately reuses Voxel's already-installed native Node Playwright core, proving interoperability without replacing its toolchain.

VOXEL_INSPECTION=NOT_RUN_FRONTEND_NOT_RUNNING
VOXEL_LOCAL_INSPECTION_READY=PARTIAL_AGENT_ZERO_BROWSER_READY_BUT_NO_LIVE_VOXEL_SERVER

=== SECURITY STATE ===

- `WEB_UI_HOST=127.0.0.1`, `WEB_UI_PORT=5000` in the live process environment.
- `/api/health` and `/` both returned 200 over loopback.
- Active tunnel processes: none.
- Ports 9222/9223: closed; no external CDP service introduced.
- Secret scan across all three Agent Zero repair commits: zero NVIDIA-key, GitHub-token, private-key, or generic credential assignments.
- No secrets included in this report.
- Existing user chats, credentials, browser profiles, state, and all 19 legacy/untracked entries were preserved.

PORT_5000_LOOPBACK_ONLY=YES
ACTIVE_TUNNEL=NO
SECRET_SCAN=PASS

=== FINAL TEST EVIDENCE ===

Fresh final source/regression command after all production changes:

- 39 tests passed in 49.11 seconds across Python 3.14 compatibility, Termux launcher, native browser runtime/lifecycle, Termux watchdog polling, host-browser connector, and plugin activation.
- `node --check` passed for the bridge.
- Python `compileall` passed for all changed Python runtime files.
- `/api/health`=200; UI root=200.
- Final health identity: branch `angel/agent-zero-readiness-20260822`, commit `1e1ed797a6e8e06fad0cc2f70d5a77909d13fbf0`.
- Tracked worktree clean; exactly 19 pre-existing untracked entries remain.
- Fresh primary authenticated inference passed.
- Fresh embedding call passed (2 × 2048 numeric distinct vectors).
- Agent-task browser acceptance passed.
- A/B/C/D artifacts and parent aggregation re-parsed and revalidated successfully.
- Final idle CPU 180-second median=2.600%, max=4.199%, no sample above 10%.

=== REMAINING ISSUES ===

1. Live Voxel inspection was not run because the frontend was not running; Agent Zero's generic local browser path is ready.
2. Native Termux browser support depends on an existing `playwright-core` package discovered by the canonical launcher. This intentionally reuses the existing Voxel package instead of downloading a redundant browser stack.
3. Agent Zero's upstream Patchright cache startup hook still warns that the Patchright requirement is absent; the native Termux backend does not use Patchright and is functional despite that non-fatal warning.
4. The 19 legacy/untracked artifacts remain preserved by design.

=== CANONICAL AGENT ZERO POST-REPAIR SNAPSHOT ===

AGENT_ZERO_REPAIR_VALIDATION=COMPLETE
AGENT_ZERO_REPO=EchoEe247/agent-zero
AGENT_ZERO_BRANCH=angel/agent-zero-readiness-20260822
AGENT_ZERO_COMMIT=1e1ed797a6e8e06fad0cc2f70d5a77909d13fbf0
TRACKED_WORKTREE_CLEAN=YES
UNTRACKED_LEGACY_ENTRIES=19_PRESERVED
HEALTH=PASS_HTTP_200
UI_ROOT=PASS_HTTP_200
BIND=127.0.0.1:5000
CPU_READY=YES_MEDIAN_2.600_PERCENT_OVER_180_SECONDS
PRIMARY_INFERENCE=PASS
UTILITY_ROUTE=PASS
EMBEDDING_INFERENCE=PASS_2048_DIMENSIONS
BROWSER_AUTOMATION_READY=YES
PLAYWRIGHT_OR_PATCHRIGHT_READY=YES_PLAYWRIGHT_CORE_REUSED
TERMUX_X11_READY=NOT_REQUIRED
HERMES_DELEGATION_READY=YES
SUBAGENT_A=PASS
SUBAGENT_B=PASS
SUBAGENT_C=PASS
SUBAGENT_D_FAILURE_HANDLING=PASS
PARENT_AGGREGATION=PASS
SUBAGENT_SYSTEM_READY=YES
VOXEL_LOCAL_INSPECTION_READY=PARTIAL
PORT_5000_LOOPBACK_ONLY=YES
ACTIVE_TUNNEL=NO
SECRET_SCAN=PASS
