#!/usr/bin/env bash
# Fetch the four Android build tools from npm packages that bundle them (no Android SDK needed).
#   aapt2 (Linux x64)        ← aaptjs3
#   android.jar, d8.jar, apksigner.jar, ecj.jar ← @drxiaozhi/minapk
# On macOS use aaptjs3's bin/x64/darwin/aapt2 instead; on Windows use minapk's tools/aapt2.exe.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p tools tmp && cd tmp
npm pack aaptjs3@2.0.2 @drxiaozhi/minapk@0.4.0 --silent
tar -xzf aaptjs3-2.0.2.tgz && tar -xzf drxiaozhi-minapk-0.4.0.tgz
case "$(uname -s)" in
  Darwin) cp package/bin/x64/darwin/aapt2 ../tools/aapt2 ;;
  *)      cp package/bin/x64/linux/aapt2 ../tools/aapt2 ;;
esac
chmod +x ../tools/aapt2
cp package/tools/android.jar package/tools/d8.jar package/tools/apksigner.jar ../tools/
cp package/tools/ecj-*.jar ../tools/ecj.jar
cd .. && rm -rf tmp
ls -la tools
