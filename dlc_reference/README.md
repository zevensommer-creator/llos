# dlc_reference — 参考 DLC（第一代）

- `dlc.de.fsi-construction.json`：参考 DLC manifest（dlc-manifest 0.2.0）。FSI 传统三训练模式：
  - `mode.substitution_drill`（scenario frame → 替换训练）
  - `mode.valence_cloze`（argument_structure frame → 配价挖空）
  - `mode.construction_drill`（其余 frame → 构式训练）
- `templates/feedback-generic.json`：反馈模板工件。编译时由 templateResolver 解析，其 sha256 写入 Executable IR 的 `feedback.template_ref`。
- `package.sha256` 当前为占位（打包/安装期完整性属 P4 市场线，编译期不校验；见 TASKS.md T-018 备注）。
- claims 与 evidence policy 版本随 manifest 一起演化；Core 对 claim_ref 不透明（基线 §4.2）。
