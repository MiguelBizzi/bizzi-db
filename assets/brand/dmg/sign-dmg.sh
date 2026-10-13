#!/usr/bin/env bash
# Signs a DMG with the Developer ID certificate, using a throwaway keychain.
# Re-creating the image in brand-dmg.sh drops the signature Tauri applied, and the keychain tauri-action
# builds is gone by the time later workflow steps run, so the certificate is imported again here.
# usage: sign-dmg.sh path/to/Bizzi.DB_x.y.z_arch.dmg
# env:   APPLE_CERTIFICATE (base64 .p12), APPLE_CERTIFICATE_PASSWORD, APPLE_SIGNING_IDENTITY
set -euo pipefail

dmg="${1:?usage: sign-dmg.sh <file.dmg>}"
: "${APPLE_CERTIFICATE:?APPLE_CERTIFICATE is not set}"
: "${APPLE_CERTIFICATE_PASSWORD:?APPLE_CERTIFICATE_PASSWORD is not set}"
: "${APPLE_SIGNING_IDENTITY:?APPLE_SIGNING_IDENTITY is not set}"

work="$(mktemp -d)"
keychain="$work/dmg-signing.keychain-db"
password="$(uuidgen)"
cleanup() {
  security delete-keychain "$keychain" >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

security create-keychain -p "$password" "$keychain"
security set-keychain-settings -lut 3600 "$keychain"
security unlock-keychain -p "$password" "$keychain"
printf '%s' "$APPLE_CERTIFICATE" | base64 --decode > "$work/certificate.p12"
security import "$work/certificate.p12" -k "$keychain" -P "$APPLE_CERTIFICATE_PASSWORD" -T /usr/bin/codesign -T /usr/bin/security >/dev/null
security set-key-partition-list -S apple-tool:,apple: -s -k "$password" "$keychain" >/dev/null

codesign --force --sign "$APPLE_SIGNING_IDENTITY" --timestamp --keychain "$keychain" "$dmg"
codesign --verify --strict "$dmg"
echo "signed: $dmg"
