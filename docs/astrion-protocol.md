# Astrion 本机状态接入（协议 v1）

本接入需要支持 CrossPet 协议 v1 的 Astrion。它让 Astrion 后端输出工作状态，CrossPet 读取本机快照；不启动模型、不消耗对话额度、不连接 Astrion API、不读取登录凭据。Web、CLI、桌面端共用同一后端，仅本机 host 模式生效，云端/Docker 服务不输出桌宠状态。

## 接入

**只需在 Astrion 的设置 → 通用中打开「CrossPet 联动」**，CrossPet 会直接读取状态，不需要先在接入列表点击安装。默认两边目录一致（macOS `/tmp/crosspet`、Windows `%LOCALAPPDATA%\CrossPet\state`），通常不需要任何登记。

输出开关由 Astrion 独立保存，默认关闭、所有工作区共用。开启后启动观察器，关闭后停止写入三个状态文件，CrossPet 在约 45 秒后自动清理自身来源。旧版 Astrion 没有输出能力时，需要先更新后端；安装 CrossPet 不能替它升级。

macOS 状态目录默认 `/tmp/crosspet`，Windows 默认 `%LOCALAPPDATA%\CrossPet\state`。这些文件不在 Astrion 的 `~/.astrion/astrion/` 数据目录内。Astrion 输出目录优先采用 `CROSSPET_STATE_DIR`，其次可选的 `astrion.json` 中的 `state_dir`，再回退平台默认值；两个进程需要相同目录。

只有在使用自定义状态目录时才需要登记：可以在 CrossPet 设置 →「接入 AI」里点 Astrion 的「接入 / 撤销」，设置窗口和命令行用的是同一个工具：

```sh
python3 tools/integrate.py install astrion
python3 tools/integrate.py uninstall astrion
python3 tools/integrate.py status
```

安装只写 CrossPet 自己的目录登记文件，保留你已登记过的目录和其他字段并备份，不修改 Astrion 配置；撤销时如果本来就没有登记，不会新建文件或目录（也不会因为看到新鲜快照就当你登记过）。`enabled` 标记不控制 Astrion 的输出。要停止联动，请关闭 **Astrion** 设置里的开关。

可选登记文件在 macOS 的 `~/Library/Application Support/CrossPet/astrion.json`、Windows 的 `%LOCALAPPDATA%\CrossPet\astrion.json`；`CROSSPET_DATA_DIR` 可覆盖其目录。

## 快照

Astrion 使用原子替换输出 `astrion-state.json`，不占用现有角色/其他 AI 的状态文件。以下仅为格式示例：

```json
{
  "version":1,"source":"astrion","instance":"opaque-runtime-id","sequence":12,"ts":1791980000,
  "foreground":{"session":"opaque-session-id","model":"gpt-example","character":"gpt","ts":1791980000},
  "sessions":{
    "opaque-session-id":{
      "character":"gpt","model":"gpt-example","pose":"reading","event":"PreToolUse","tool":"read_file",
      "ts":1791980000,"event_ts":1791979999,"revision":3,"active":true,"tools":1
    }
  }
}
```

角色 ID 沿用角色目录名，未安装或无法识别的模型由当前角色演。姿态沿用已有 thinking/reading/writing/running/searching/drawing/delegating/asking/compact/happy/proud/oops/surprised。事件名只控制原有动画的持续/结束语义。

`ts` 是心跳，`event_ts` 是动作发生时间；相同 revision 的心跳只刷新活动，不反复播放动作或庆祝。实例 ID 在后端重启后更换。读取端只接受 v1、Astrion 来源、最近 45 秒且不超过 1 MB/256 会话的快照；过期或源文件消失时只清理 Astrion 来源。主任务结束但后台工作未结束时保持活动；真正结束后完成卡片保留 4 秒。出错和手动停止不庆祝。

会话键是用户/工作区/对话身份的不可读摘要。同一角色的多个会话独立累计工具次数；模型切换后旧角色不保留同一会话的活动记录。已有 hooks 的会话与 Astrion 会话合并，不因 Astrion 写新快照、退出或撤销而覆盖其他 AI。等待状态优先，收到明确的审批/提问解除事件才恢复工作。两平台原生置顶和贴边判断单独保存 Astrion 贡献，45 秒过期后不再使用，避免旧的 asking 状态继续影响窗口层级，也不删除其他 AI 的状态。

`astrion-host.json` 提供当前桌面会话的模型/角色。macOS 识别 `com.astrion.desktop`，Windows 程序映射 `astrion.exe`。`seen-astrion` 只用于最近收到消息的诊断。所有文件都不含对话正文、工具参数、命令内容、工具结果、异常文本、路径、账户密钥或令牌。

## GPT 订阅额度

新版 Astrion 可在已有快照中附加 `quota.gpt`。Astrion 使用自己的订阅 OAuth 和代理查询用量，CrossPet 仅接收数字，不读取 Astrion 或 Codex 的凭据。无须本机 Codex 另行登录；Astrion 的联动开关同时控制状态输出和额度查询。CrossPet 设置 → 额度中新增「显示 Astrion 的 GPT 额度」，与原有「显示 GPT 额度」各自独立、互相排斥；原有选项保持只读本机 Codex，行为不变。

字段为 `connected`、`status`（checking/live/stale/unavailable）、随机登录代次 `epoch`、最后成功查询的 `at`，及 `rateLimits.primary/secondary` 中的 `usedPercent/windowDurationMins/resetsAt`。只接收有限数值与时间，不接收账号 ID、原始接口响应、错误正文、套餐资料或 credits。没有此可选字段的旧 v1 生产者继续按原方式工作。

打开「显示 Astrion 的 GPT 额度」后读取快照里的额度，并在额度文字中标注来源；数据不可用时不拿本机 Codex 的另一个账号顶替，也不会自动切回 Codex。该选项开启期间，原生额度轮询暂停对本机 Codex 的查询。切换来源或登录代次不触发额度恢复庆祝。

Astrion 正常活动约 60 秒查询一次、空闲约 120 秒；快照心跳不能更新额度的 `at`。查询失败、150 秒无成功数据或窗口重置时间已到时标注旧数据，过了重置时间的窗口显示「待更新」，不推算剩余 100%。超过 15 分钟的额度隐藏。新鲜真实数据继续使用现有低额度和额度恢复反应。

## 维护与验证

- 通用纯逻辑：`app/web/astrion.js`，视图适配：`app/web/astrion-view.js`。
- 原生读取：`app/mac/App+Astrion.swift`、`app/windows/src/Pet.Astrion.cs`。
- 额度选择和过期：`app/web/astrion-quota.js`；视图与原生的额度显示开关同步。
- 安装/撤销/状态/诊断：`tools/integrate.py`，两平台的接入列表同样登记 Astrion。

```sh
node --test tests/astrion.test.js
python3 -m unittest tests.astrion_integration_test
python3 -m unittest tests.integrate_test
swiftc -typecheck -module-cache-path .astrion/clang-module-cache app/mac/*.swift
```

`package.json` 只声明 `type: commonjs` 和一条无依赖的 `npm test`（等价于 `node --test tests/*.test.js tests/*.test.mjs`）：本目录被放在使用另一种模块类型的工程里时，网页层测试仍按 CommonJS 解析。它不是新的运行依赖。

macOS 类型检查不是实际窗口验收，Windows 需原生构建与实机运行。额度接入与后续调整按用户要求仅改文件，未执行运行回归、真实额度查询或原生构建，需用户实测；既往回归结果不能视为此轮改动已通过。API 余额/费用不在此次额度功能范围，Astrion 累计 API 消费不会冒充剩余额度。
