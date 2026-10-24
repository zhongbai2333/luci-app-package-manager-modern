# Modern Package Manager for LuCI

**Find packages, review an operation queue, and install, upgrade or remove packages in batches.**

[简体中文](README.md) · English

[Download v0.2.0-r3](https://github.com/zhongbai2333/luci-app-package-manager-modern/releases/tag/v0.2.0-r3) · [Install](#installation) · [Usage](#usage) · [Build](#building-and-development) · [Verification record](docs/verification.md)

`luci-app-package-manager-modern` is a native LuCI application for **OpenWrt 25.12 with APK**. It runs alongside the official package manager page and is available under **System → Modern Package Manager**.

The application uses LuCI's existing login, sessions, permissions and theme. Package operations run through the system's APK tools. No Node.js, Python, additional web server or application-specific background service is required on the router.

## Screenshots

![Desktop view with Footstrap: package list, operation queue and repository information](docs/screenshots/footstrap-final.png)

<p>
  <img src="docs/screenshots/footstrap-mobile-dark.png" alt="Footstrap at a mobile-width viewport in dark mode" width="280">
  <img src="docs/screenshots/footstrap-mobile-light.png" alt="Footstrap at a mobile-width viewport in light mode" width="280">
</p>

Screenshots were captured in isolated test environments; mobile layouts were checked at a 390px browser viewport. More theme screenshots and test conditions are documented in the [verification record](docs/verification.md) (Chinese).

## Features

| Task | Available behavior |
| --- | --- |
| Find packages | All packages, Installed, Installable packages and Updates views; search package names and descriptions, with exact names and prefixes ranked first |
| Narrow the list | LuCI, kernel module and other package categories; sort by relevance, name or package file size; 50 items per page |
| Prepare operations | Select across pages; queue up to 100 packages; remove individual entries or clear the queue; reload and validate package state before execution |
| Run batches | Execute install → upgrade → remove groups; display a waiting state, final output and APK exit codes |
| Inspect details | Installed and repository versions, package file size, installed size, architecture, license, direct dependencies and installed direct reverse dependency hints |
| Check repositories and storage | Display cached index information, explicitly refresh configured repository indexes, and read available device storage |
| Use existing LuCI settings | Read-only sessions, styles scoped to the application and inherited from the theme, and an optional Simplified Chinese translation package |

## Requirements

- **System:** OpenWrt 25.12 using APK. Firmware using opkg is not supported.
- **Runtime dependencies:** `luci-base`, `luci-app-package-manager` and `apk`, supplied by the device's configured trusted repositories. The system helper `/usr/libexec/package-manager-call` is required.
- **Permissions:** Viewing requires LuCI base read permissions and the application's read permissions. Installing, upgrading, removing and refreshing indexes also require the application's write permissions.
- **Language:** The interface follows LuCI's language setting; the Simplified Chinese package provides the Chinese translation.

Release APKs are marked `noarch`. This does not mean they have been validated on every CPU architecture. Recorded runtime checks cover an x86/64 25.12.0 userspace environment and a 25.12.6 virtual machine. ARM/MIPS devices and physical routers have not been tested.

## Installation

### 1. Download and verify

Download these files from the [v0.2.0-r3 release](https://github.com/zhongbai2333/luci-app-package-manager-modern/releases/tag/v0.2.0-r3):

| File | Purpose |
| --- | --- |
| `luci-app-package-manager-modern-0.2.0-r3.apk` | Required application package |
| `luci-i18n-package-manager-modern-zh-cn-0.2.0-r3.apk` | Optional Simplified Chinese translation |
| `SHA256SUMS` | SHA-256 checksums for both APKs |

On the computer where you downloaded the files, place all three in the same directory and compare them with the published checksums:

```sh
tr -d '\r' < SHA256SUMS | sha256sum -c -
# On macOS: tr -d '\r' < SHA256SUMS | shasum -a 256 -c -
```

The source repository keeps the same checksum record in [packages/SHA256SUMS](packages/SHA256SUMS). APKs are distributed separately through Releases.

### 2. Install on a test device

Current release assets are development builds without a production firmware release signature. The `--allow-untrusted` option below is for installing verified local APKs on a chosen test device. Production firmware and repositories should sign packages through their own build system.

Copy the APKs to the router's `/tmp/` directory using SCP or another transfer method, then run the following **in the router's terminal**:

```sh
apk add --allow-untrusted /tmp/luci-app-package-manager-modern-0.2.0-r3.apk

# Optional: install the Simplified Chinese translation
apk add --allow-untrusted /tmp/luci-i18n-package-manager-modern-zh-cn-0.2.0-r3.apk

/etc/init.d/rpcd reload
```

Dependencies should come from trusted repositories. If dependency resolution fails, check the firmware version and repository configuration before proceeding. Do not force installation by ignoring dependencies.

### 3. Open the application

Log in to LuCI again and open **System → Modern Package Manager**. Reload the browser page if the menu has not appeared. Installing the Chinese translation does not change LuCI's global language setting.

## Usage

1. Choose a package view and search by name or description. Use categories and sorting to narrow the results.
2. Click a package name to inspect its details. The install, upgrade and uninstall buttons add operations to the queue; you can also select packages across pages and add them together.
3. Check each queued package and action, then select **Review operations…**. The application reloads device state and checks that the selection is still valid.
4. Confirm execution, wait for APK to finish, inspect the output and exit codes, and check the refreshed package state.

In the **Installed** view, the list action queues a package for **removal**. To upgrade an installed package, use the **Updates** view or the upgrade action in its details.

The two refresh actions serve different purposes: **Reload package data** reads current device state and cached indexes; **Refresh repositories…** downloads indexes from configured repositories without upgrading installed packages. Cached repository information does not establish that every repository is reachable.

### Failures and operation limits

- **Batches do not provide transaction rollback.** Successful groups leave the queue. After a group failure or transport error, the application stops later groups, attempts to reload package state, and retains failed and unexecuted entries. A failed group may already have made partial changes; inspect package state before retrying.
- **A lost connection does not establish rollback or cancellation.** Operations are not retried automatically, and the server may continue after the page closes. Read device state again before deciding what to do next.
- **Queues and logs exist only in the current page's memory.** Navigation or a browser reload discards them. Copy any logs you need before leaving the page.
- **Size and dependency hints are informational.** The queued package file total excludes additional dependencies and does not guarantee enough disk space. Reverse dependency hints cover direct relationships among installed packages; APK performs the final dependency resolution.
- **There is no live percentage.** The system helper returns final output, so the page displays a waiting state followed by results. There are no package upload, manual URL installation, force-overwrite, force-removal or full-system upgrade controls.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Menu missing after installation | Confirm the application package is installed, reload rpcd, log in to LuCI again and check application ACL permissions |
| Package information cannot be loaded | Check that the system uses APK, runtime dependencies are present, the application helper is executable and the session has read permissions |
| Install or refresh buttons disabled | Check for a read-only session or an operation in progress; after a state reload fails, a successful reload is required before further writes |
| Repository refresh or package operation fails | Inspect final output and the APK exit code; check device connectivity and repository configuration, then verify current package state before selecting operations again |
| Interface remains English after installing the translation | Check LuCI's language setting and log in again or reload the page |

When reporting a problem, include the firmware and APK versions, theme, reproduction steps and relevant logs. Remove repository credentials and other sensitive information before posting to [Issues](https://github.com/zhongbai2333/luci-app-package-manager-modern/issues).

## Verification scope

These results summarize the repository's [verification record](docs/verification.md) for **0.2.0-r3**. They do not establish coverage of every device or theme. Detailed supporting documents are currently in Chinese.

| Environment or check | Recorded result |
| --- | --- |
| OpenWrt 25.12.0 x86/64 userspace, APK 3.0.2 | Real package installation/removal, batch installation/upgrade/removal of test packages, read-only and unauthenticated access checks; the PRoot environment included hardware-information stubs and was not a full system boot |
| OpenWrt 25.12.6 Hyper-V VM, APK 3.0.5 | Application installation/upgrade, batch installation/removal of official `tree` and `less` packages, repository refresh and queue retention after failure |
| Themes and layouts | Bootstrap and Footstrap desktop and 390px light/dark layouts; Argon 3.1.0 desktop light/dark layouts |
| Development checks | 21 automated tests; JS, JSON, Chinese translation coverage, separate read/write ACLs and helper syntax checks |

Physical hardware, ARM/MIPS, power loss, very low memory, disk exhaustion and a complete firmware dependency build remain untested. Physical mobile browsers and Argon at narrow widths have not had a full regression pass. See the [verification record](docs/verification.md) and [ACL test results](docs/acl-results.json) for conditions, screenshots and permission results.

## Building and development

### Build with an OpenWrt SDK or firmware source tree

From the root of a matching OpenWrt SDK or firmware source tree, prepare the LuCI and base feeds and add this project:

```sh
git clone https://github.com/zhongbai2333/luci-app-package-manager-modern.git \
  package/luci-app-package-manager-modern
./scripts/feeds update -a
./scripts/feeds install -a
make menuconfig
# LuCI → Applications → luci-app-package-manager-modern
# LuCI → Translations → Chinese Simplified (optional)
make package/luci-app-package-manager-modern/compile V=s
```

For firmware builds, the corresponding configuration is:

```text
CONFIG_PACKAGE_luci-app-package-manager-modern=y
CONFIG_PACKAGE_luci-i18n-package-manager-modern-zh-cn=y
```

Output is normally under `bin/packages/<architecture>/base/`. The Makefile uses standard `luci.mk` and sets the helper's executable permissions during preparation.

The recorded package build used the official 25.12.0 SDK. Its standalone base feed was incomplete, so the normal dependency build stopped at a missing `lua.h` in `lucihttp`. Packages were then built with `NO_DEPS=1` and checked in the environments above. This does not establish a successful full dependency or firmware build; use complete, matching feeds for integration.

### Run development checks

From this repository's root, use Node.js 22 as in the existing CI workflow. No npm dependency installation is needed:

```sh
npm test
npm run check
sh -n root/usr/libexec/package-manager-modern
```

Node.js is used only for development checks. Changes to package operations, permissions or theme integration also need validation in an isolated OpenWrt environment.

### Source structure and responsibilities

| Path | Responsibility |
| --- | --- |
| [Makefile](Makefile) | LuCI package definition and dependencies |
| [view/system/package-manager-modern.js](htdocs/luci-static/resources/view/system/package-manager-modern.js) | Page, queue review and execution flow |
| [backend.js](htdocs/luci-static/resources/package-manager-modern/backend.js) | LuCI fs/rpc calls and exit-code handling |
| [model.js](htdocs/luci-static/resources/package-manager-modern/model.js) | Parsing, search, sorting, queue validation and dependency hints |
| [style.css](htdocs/luci-static/resources/package-manager-modern/style.css) | Layout styles scoped to the application |
| [package-manager-modern](root/usr/libexec/package-manager-modern) | Bounded argument entry point; reads APK data and delegates writes to the system helper |
| [menu.d](root/usr/share/luci/menu.d/) / [acl.d](root/usr/share/rpcd/acl.d/) | Native menu and separate read/write permissions |
| [po/zh_Hans](po/zh_Hans/) / [tests](tests/) | Simplified Chinese translation and automated checks |

See the [integration design](docs/integration.md) (Chinese) for interfaces, argument limits, permissions and failure handling. Pull requests for features, translations and tests are welcome; include the environment used to validate the change.

## License

This project is licensed under the [Apache License 2.0](LICENSE).
