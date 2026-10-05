#!/usr/bin/env bash
# Build the 月隐 Android APK without Gradle or Android Studio.
# Needs: JDK 17+, python3, and the tools in ./tools (run ./fetch-tools.sh once, or copy them from an Android SDK:
#   build-tools/<ver>/aapt2, build-tools/<ver>/lib/d8.jar, build-tools/<ver>/lib/apksigner.jar, platforms/android-34/android.jar).
set -euo pipefail
cd "$(dirname "$0")"
TOOLS=${TOOLS:-tools}
AAPT2=$TOOLS/aapt2; ANDROID_JAR=$TOOLS/android.jar; D8=$TOOLS/d8.jar; APKSIGNER=$TOOLS/apksigner.jar
KS=${KS:-moontrace-release.jks}; KS_PASS=${KS_PASS:-moontrace}; KS_ALIAS=${KS_ALIAS:-moontrace}
VERSION_CODE=${VERSION_CODE:-3}; VERSION_NAME=${VERSION_NAME:-3.0}
for f in "$AAPT2" "$ANDROID_JAR" "$D8" "$APKSIGNER"; do [ -f "$f" ] || { echo "missing $f — run ./fetch-tools.sh"; exit 1; }; done

# The web app is the single source of truth: copy the latest build into assets.
[ -f ../web/index.html ] && cp ../web/index.html assets/www/index.html

rm -rf build && mkdir -p build/classes build/dex build/gen
"$AAPT2" compile --dir res -o build/res.zip
"$AAPT2" link -o build/base.apk -I "$ANDROID_JAR" --manifest AndroidManifest.xml -A assets --java build/gen \
  --min-sdk-version 24 --target-sdk-version 34 --version-code "$VERSION_CODE" --version-name "$VERSION_NAME" --auto-add-overlay build/res.zip
# JDK 21+ javac writes MethodParameters entries without names for inner-class constructors, which this d8 build rejects;
# ecj (Eclipse compiler, bundled by fetch-tools.sh) is used when present, otherwise javac (fine on JDK 17–20).
if [ -f "$TOOLS/ecj.jar" ]; then
  java -jar "$TOOLS/ecj.jar" -8 -proc:none -nowarn -cp "$ANDROID_JAR" -d build/classes src
else
  javac --release 8 -Xlint:-options -cp "$ANDROID_JAR" -d build/classes $(find src -name '*.java')
fi
java -cp "$D8" com.android.tools.r8.D8 --release --min-api 24 --lib "$ANDROID_JAR" --output build/dex $(find build/classes -name '*.class')
python3 pack.py build/base.apk build/dex/classes.dex build/unsigned.apk
if [ ! -f "$KS" ]; then
  keytool -genkeypair -keystore "$KS" -alias "$KS_ALIAS" -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass "$KS_PASS" -keypass "$KS_PASS" -dname "CN=Moontrace, O=Moontrace"
fi
java -jar "$APKSIGNER" sign --ks "$KS" --ks-pass "pass:$KS_PASS" --key-pass "pass:$KS_PASS" --ks-key-alias "$KS_ALIAS" \
  --v4-signing-enabled false --out build/moontrace.apk build/unsigned.apk
java -jar "$APKSIGNER" verify --print-certs build/moontrace.apk
echo "→ build/moontrace.apk"
