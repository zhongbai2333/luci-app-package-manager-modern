include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-package-manager-modern
PKG_VERSION:=0.2.0
PKG_RELEASE:=3
PKG_LICENSE:=Apache-2.0
PKG_PO_VERSION:=$(PKG_VERSION)-r$(PKG_RELEASE)

LUCI_TITLE:=Modern native LuCI package manager
LUCI_DEPENDS:=+luci-base +luci-app-package-manager +apk
LUCI_PKGARCH:=all

# Preserve executable mode even when the source was unpacked on Windows.
define Build/Prepare/luci-app-package-manager-modern
	chmod 0755 $(PKG_BUILD_DIR)/root/usr/libexec/package-manager-modern
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
