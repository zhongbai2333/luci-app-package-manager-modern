# luci-app-package-manager-modern

OpenWrt 25.12 原生 LuCI 软件包管理插件，版本 0.2.0-r3。与官方“软件包”页面并存，菜单位于 **系统 → 现代软件包管理**。

这是接入真实 APK 的插件源码，不再是独立 HTML 原型。复用 LuCI 登录、会话、菜单、页面加载、翻译及 rpcd 授权；路由器无需 Node、Python、额外 Web 服务或常驻后台。

## 功能

- 已安装、可安装、可更新和全部视图；包名/描述即时搜索、分类、相关度/名称/体积排序，每页 50 项。默认优先完整包名与包名前缀匹配。
- 多选与跨页选择、最多 100 包的待执行队列、逐项移除与清空、执行前重新读取并校验状态。
- 分组批量安装、更新、卸载；显示真实等待状态、最终输出和 APK 返回码，不显示伪造的实时百分比。
- 包详情、已安装/软件源版本、包文件体积、安装占用、架构、许可证、直接依赖和反向依赖提示。
- 读取软件源缓存索引，显式刷新索引，不自动升级系统；显示真实可用存储空间。
- 只读会话禁用写操作，服务端 ACL 独立阻止写入；页面样式均限定在插件自身范围。
- 标准 LuCI 控件与继承色彩，手机触摸目标、分页、浮动队列入口；提供简体中文翻译包。

## 界面预览

![Footstrap 桌面界面](docs/screenshots/footstrap-final.png)

[手机深色界面](docs/screenshots/footstrap-mobile-dark.png) · [手机浅色界面](docs/screenshots/footstrap-mobile-light.png) · [验证范围](docs/verification.md)

## 安装包

主插件 APK 与中文 APK 的架构为 `noarch`，预构建文件应从本仓库的 GitHub Releases 获取。源码仓库只保留 `packages/SHA256SUMS`，本地交付目录另含对应 APK。源码没有上传、手工 URL 安装、强制覆盖、强制移除或全系统升级入口。

这些开发 APK 没有用你的固件发布密钥签名。仅在你明确选择的测试设备上安装本地包时，可使用：

```sh
apk add --allow-untrusted /tmp/luci-app-package-manager-modern-0.2.0-r3.apk /tmp/luci-i18n-package-manager-modern-zh-cn-0.2.0-r3.apk
/etc/init.d/rpcd reload
```

基础依赖 `luci-base`、`luci-app-package-manager` 和 `apk` 必须由设备配置的可信软件源提供。正式固件或仓库应使用自己的构建系统签名，不把测试密钥加入生产设备。安装后重新登录 LuCI；若未出现菜单，重新加载页面。中文跟随 LuCI 的语言设置，插件不擅自改变全局语言。

当前验证范围为隔离测试环境，尚未在生产路由器部署。

## SDK 与固件集成

将本目录复制到**独立 SDK 或固件源码**的 `package/luci-app-package-manager-modern/`。SDK 必须准备相匹配的 LuCI 与 base feed，然后选择插件与翻译：

```sh
./scripts/feeds update -a
./scripts/feeds install -a
make menuconfig
# LuCI → Applications → luci-app-package-manager-modern
# LuCI → Translations → Chinese Simplified
make package/luci-app-package-manager-modern/compile V=s
```

固件配置对应：

```text
CONFIG_PACKAGE_luci-app-package-manager-modern=y
CONFIG_PACKAGE_luci-i18n-package-manager-modern-zh-cn=y
```

输出通常位于 `bin/packages/<架构>/base/`。Makefile 使用标准 `luci.mk`，并在准备阶段明确设定 helper 的可执行权限，以兼容 Windows 解压后的源码。

本次使用已校验的官方 OpenWrt 25.12.0 x86/64 SDK。独立 SDK 最初未准备完整 base feed，常规依赖构建在 lucihttp 缺少 lua.h 处停止；插件自身随后用 `NO_DEPS=1` 完成打包并安装到真实 25.12.0 用户态环境验证。这个选项只跳过 SDK 依赖编译，没有移除 APK 的运行依赖，也不是完整固件构建通过的声明。正式集成请使用完整匹配的 feeds。

## 项目结构

```text
Makefile
htdocs/luci-static/resources/
  view/system/package-manager-modern.js   LuCI 原生页面
  package-manager-modern/backend.js        LuCI fs / rpc 适配
  package-manager-modern/model.js          数据、搜索、队列校验
  package-manager-modern/style.css         页面局部样式
root/usr/libexec/package-manager-modern   受控参数入口
root/usr/share/luci/menu.d/               原生菜单
root/usr/share/rpcd/acl.d/                 读写权限
po/zh_Hans/                               简体中文翻译
tests/                                   开发机自动检查
docs/                                    接口和验证记录
packages/                                构建产物校验和（APK 单独发布）
```

开发机可运行 `npm test` 和 `npm run check`，均不需要安装依赖。Node 只用于开发机测试，不参与路由器运行。

## 行为边界

队列预览不是 APK 完整求解或磁盘空间保证，包文件体积不包括新增依赖。反向依赖只是已安装包中的直接关系提示，最终以 APK 为准。

每组操作不是原子事务。成功组从队列移除；失败组及后续组保留，停止后续写入并重新读取状态。失败组内部可能已完成部分变更，用户须核对状态再重新选择。传输中断不会被视为成功，也不会自动重试。日志与未执行队列保存在当前页面内存中，离页/刷新后不会恢复；执行中离页可能让服务端操作继续，不能把关闭页面当作取消。

详细信息见 [接入设计](docs/integration.md) 和 [验证记录](docs/verification.md)。
