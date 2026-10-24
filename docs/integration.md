# 接入设计与权限

## 原生集成

标准 LuCI view 从 `admin/system/package-manager-modern` 加载。没有独立登录、后台品牌壳、顶层导航或后台服务。`view.extend()`、`L.hasViewPermission()`、`L.resource()`、`ui.showModal()`、`fs.exec_direct()`、`rpc.declare()` 与 `_()` 均来自系统 LuCI。

CSS 只作用于 `.pm-modern`、`.pm-modern-dialog`，不写入 body、主题根变量或全局 `.btn` 规则。标准按钮、输入框、区块和弹窗继承主题样式；局部布局无固定页面背景/文字颜色。

## 受控 helper

`/usr/libexec/package-manager-modern` 是按需运行的 shell 参数门，不是新的包管理器。固定 PATH 和 LC_ALL，不使用 eval，不拼接 shell 命令。只允许固定动作、1–100 个包名、最长 128 字符，以及字母数字开头和 `[A-Za-z0-9+_.-]` 字符；拒绝 URL、仓库标签、空参数、通配符、选项和 shell 片段。

读取直接调用 APK：

- `list-installed` → `apk query --fields all --format json --installed --from system '*'`
- `list-available` → `apk query --fields all --format json --available '*'`
- `list-updates` → `apk query --available --upgradable --fields name,version --format json '*'`
- `source-status` → `apk version --indexes`，仅表示缓存索引信息。

读取使用直接 APK query 的原因：较新版本的系统 helper 已支持 JSON，但实际 25.12.0 官方系统 helper 使用 `apk list --full`，可能列出同名多个版本。APK query 由 APK 选择最佳候选并保留真实错误，前端不自行猜测版本顺序。数据模型仍兼容两种格式。可更新判断直接来自 APK 的 `--upgradable`，支持 APK 自身的版本和仓库标签语义。

全部写操作继续委托**系统已有** `/usr/libexec/package-manager-call`：

| UI 动作 | 系统 helper | APK |
| --- | --- | --- |
| 安装 | install 包名… | add |
| 更新所选 | upgrade 包名… | upgrade 包名… |
| 卸载 | remove 包名… | del |
| 刷新索引 | update | update |

没有复制/修改系统 helper，没有额外强制参数，保留官方 helper 的锁与 APK 处理行为。包装层参数错误返回 `{"code":64,"stderr":"…"}` 并退出 64；实际写入解析官方返回的 `code`、`stdout`、`stderr`，非零不能当作成功。CGI 可能在进程非零退出时仍返回 HTTP 200，所以前端检查结果中的整数 code，而不是仅检查 HTTP 状态。

## ACL

读取权限仅含四个精确 helper 命令、`cgi-io exec`、`luci.getMountPoints`。写入权限仅含 install/upgrade/remove 的带参数形式和无参数 update。没有源配置编辑、上传、通用 `/bin/sh`、任意 APK 命令、无参数 upgrade 或文件写入权限。

原生页面的可写状态与 rpcd ACL 配合。前端禁用按钮只改善体验，真正的权限约束由 CGI/rpcd 执行。只读测试会话授予 `unauthenticated`（LuCI 特性探测与自身会话检查）、`luci-base` 与本插件的 read 组，不授予本插件 write 组。只授予插件组而缺少 LuCI 基础权限，不能正常运行 LuCI 的页面框架。

## 执行与故障

执行前再次读取并校验包状态。队列按安装、更新、卸载分组，每组一次传递多个独立 argv 参数。每组检查整数返回码；非零或传输异常立即停止后续组，不自动重试、不回滚。最终重新读取设备状态，读取失败时禁用写入直至成功刷新。发生部分失败时整个失败组保留，不能推断其中每包都没有改变。

系统 helper 一次返回最终日志，没有逐行事件或真实百分比；界面只显示等待与最终输出。由于系统仍使用普通 LuCI CGI 执行，超时、离页和服务重启的结果须在重新读取状态后人工核对。没有为了进度另建常驻任务系统。

包名、描述、日志都以文本节点插入 DOM，未通过 innerHTML 渲染索引中的内容。包操作队列中也不接受任意命令文本。

## 核对来源

- 只读核对的 LuCI 源码 `feeds/luci/applications/luci-app-package-manager/` 与 `modules/luci-base/`。
- 官方 [OpenWrt 25.12.0 x86/64 下载目录](https://downloads.openwrt.org/releases/25.12.0/targets/x86/64/) 的 SDK 与 rootfs；TUNA 镜像用于获取，SDK SHA-256 与官方目录记录一致。
- 源码缓存内 APK 3.0.5 的 query/version 文档和源码；真实 25.12.0 用户态 APK 3.0.2 的 help 与输出。

测试与构建均使用隔离目录，未修改原有固件构建树，未在生产路由器执行包操作。
