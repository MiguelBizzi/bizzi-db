#!/bin/sh
# Prepares a bare distro container to smoke-launch the Linux packages: xvfb, curl and jq for the job itself, plus the
# libraries the AppImage expects from the host.
#
# linuxdeploy never bundles the libraries on the AppImage excludelist
# (https://github.com/AppImageCommunity/pkg2appimage/blob/master/excludelist): fontconfig, freetype, harfbuzz,
# fribidi, wayland-client, X11/xcb, GL/EGL/gbm/drm, expat, zlib, gmp, gpg-error, com_err. They must match the
# host's graphics stack and font configuration, so bundling them breaks real desktops. Every desktop install has
# them; container images do not, and without them the AppImage exits 127 ("error while loading shared libraries").
# WebKit also dlopen()s libGLESv2.so.2 through libepoxy, which readelf -d does not show. Keep this list in step with
# those and with the sonames the AppImage leaves unresolved (readelf -d on the extracted squashfs-root).
set -eu
. /etc/os-release
case "$ID" in
  debian | ubuntu)
    apt-get update
    apt-get install -y --no-install-recommends xvfb xauth curl jq ca-certificates \
      libfontconfig1 libfreetype6 libharfbuzz0b libfribidi0 libwayland-client0 libx11-6 libx11-xcb1 libxcb1 \
      libegl1 libgl1 libgles2 libgbm1 libdrm2 libexpat1 zlib1g libgmp10 libgpg-error0 libcom-err2 fonts-dejavu-core
    ;;
  fedora)
    dnf install -y --setopt=install_weak_deps=False xorg-x11-server-Xvfb xorg-x11-xauth curl jq \
      fontconfig freetype harfbuzz fribidi libwayland-client libX11 libX11-xcb libxcb \
      mesa-libEGL mesa-libGL libglvnd-gles mesa-libgbm libdrm expat zlib-ng-compat gmp libgpg-error libcom_err dejavu-sans-fonts
    ;;
  arch)
    pacman -Syu --noconfirm --needed xorg-server-xvfb xorg-xauth curl jq \
      fontconfig freetype2 harfbuzz fribidi wayland libx11 libxcb \
      libglvnd mesa libdrm expat zlib gmp libgpg-error e2fsprogs ttf-dejavu
    ;;
  *)
    echo "::error::unsupported image $ID"
    exit 1
    ;;
esac
