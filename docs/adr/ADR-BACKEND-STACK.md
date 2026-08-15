# ADR：后端技术栈——TypeScript 全栈 + Python 语音子服务

- **状态**：已批准（2026-08-15，Human 选定）
- **日期**：2026-08-15
- **关联**：ADR-FRONTEND-STACK、ADR-CLIENT-SURFACES、BUILD_PLAN P1/T-014

## 决策

- **主语言**：TypeScript（Node 运行时）。`core/`、`compiler/`、`gateway/`、`market/`、`contracts/` 全部使用 TS。
- **契约代码化**：schema → **单一 TS 生成目标**（类型 + 校验），不再维护第二套生成目标。
  - 类型：`json-schema-to-typescript`；
  - 运行时校验：`ajv`（draft 2020-12，与 schema 正本同标准）。
- **语音子服务**：`speech/` 保持 Python 生态（faster-whisper、MFA、Praat/Parselmouth），以独立进程服务运行，经明确接口（输入音频+参考文本，输出 pronunciation-assessment 证据）与 TS 主服务通信；语音侧不直接读写学习状态（基线边界不变）。
- **Monorepo**：pnpm workspace 管理全部 TS 包（contracts/core/gateway/market/frontend/*），前端栈见 ADR-FRONTEND-STACK。

## 理由

1. 契约是 ABI：单一生成目标避免 pydantic + TS 双目标漂移，schema 是唯一事实源；
2. 前端已定 TS：全链路类型安全（contracts → core → API → ViewModel）；
3. Python 仅在语音域有不可替代性（对齐/声学工具链），隔离为子服务后边界清晰；
4. Fake Provider / 契约测试在 TS 内闭环（测试矩阵第 6 项）。

## 后果

- speech 子进程需要明确的进程间契约（stdin/stdout 或本地 HTTP），其输出必须通过 `pronunciation-assessment` schema 校验后方可进入 Core；
- Node 版本要求：>= 20（本机 v24.16.0）；
- Python 侧依赖不进 pnpm workspace，由 `speech/` 独立管理（uv）。
