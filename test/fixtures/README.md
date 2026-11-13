# test/fixtures

`review-policy-0.2.2-rc.1.txt` 是从 DSH `0.2.2-rc.1` 的
`@deepseek-ai/dsh-experimental-auto-review`（MIT，见上游
`packages/experimental/auto-review`）包里 `lib/index.js` 的 `REVIEW_POLICY`
常量原样摘出的系统提示词，仅用于回归测试“插入点、末行、增量”。

它不属于本仓库的代码，也不含任何用户数据；上游升级后可以重新摘一份新版本，
保留旧文件用于兼容性对照。