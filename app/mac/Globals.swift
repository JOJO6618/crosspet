// CrossPet：跨 AI 桌宠。透明无边框、永远在最上层、可拖动的小窗。
//
// 目录约定
//   ~/Library/Application Support/CrossPet/   运行目录（每次启动从 App 包里同步 web/ 和内置角色）
//       web/            画面（index.html + effects.js）
//       characters/     角色：<id>/character.json + 各姿态立绘（idle.webp、thinking-2.webp、idle-blink.webp …）
//                       自己加的角色放这里不会被覆盖
//       crosspet-hook.py  钩子脚本（Claude Code / Codex / Gemini CLI 用）
//   /tmp/crosspet/      各 AI 接入写的状态：<id>-state.json、<id>-quota.json
//
// 交互：单击 = 摸摸头；拖动 = 移动；右键 = 菜单（戳一下 / 彩蛋 / 换角色 / 改名 / 设置 / 退出）
import Carbon
import Cocoa
import ServiceManagement
import WebKit

let defaults = UserDefaults.standard
// 原有 AI 接入一律用 /tmp/crosspet；只有 Astrion 的状态文件允许放到 CROSSPET_STATE_DIR，
// 这样给它一个自定义位置时，不会把老来源的状态、额度和 pet.pid 一起迁走
let stateDir = URL(fileURLWithPath: "/tmp/crosspet", isDirectory: true)
let astrionStateDir = URL(fileURLWithPath: ProcessInfo.processInfo.environment["CROSSPET_STATE_DIR"] ?? stateDir.path, isDirectory: true)

/// astrion-*.json 与 seen-astrion 走 astrionStateDir，其它文件仍用原来的 stateDir
func stateFile(_ name: String) -> URL {
    (name.hasPrefix("astrion-") || name == "seen-astrion") ? astrionStateDir.appendingPathComponent(name) : stateDir.appendingPathComponent(name)
}
