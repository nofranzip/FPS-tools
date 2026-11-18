#!/bin/bash
# Compila FPSpaint: APK de Android e instalador de Windows.
# Uso: ./build.sh 1.1.1 12
# Requiere: Java 17+, Node 18+, aapt2 (de apktool), android.jar (API 34), dx.jar (AOSP dalvik/dx) y NSIS.
# Variables: AAPT2, ANDROID_JAR, DX_JAR, KEYSTORE, KS_PASS, MAKENSIS
set -e
VER=$1; CODE=$2; ROOT=$(cd "$(dirname "$0")" && pwd); OUT=$ROOT/dist; mkdir -p "$OUT"
# --- Android ---
cd "$ROOT/android"; rm -rf build assets; mkdir -p build/res build/classes assets; cp -r "$ROOT/app/"* assets/
"$AAPT2" compile --dir res -o build/res/
"$AAPT2" link -I "$ANDROID_JAR" --manifest AndroidManifest.xml -o build/base.apk -A assets --min-sdk-version 24 --target-sdk-version 29 --version-code $CODE --version-name $VER build/res/*.flat
javac -nowarn --release 8 -cp "$ANDROID_JAR" -d build/classes src/dev/fpspaint/app/MainActivity.java
java -jar "$DX_JAR" --dex --min-sdk-version=24 --output=build/classes.dex build/classes
cp build/base.apk build/signed.apk && (cd build && zip -q signed.apk classes.dex)
jarsigner -keystore "$KEYSTORE" -storepass "$KS_PASS" -sigalg SHA256withRSA -digestalg SHA-256 build/signed.apk fpspaint
cp build/signed.apk "$OUT/FPSpaint-$VER.apk"
# --- Windows ---
cd "$ROOT/desktop"; sed -i "s/\"version\": \"[0-9.]*\"/\"version\": \"$VER\"/" package.json; sed -i "s/!define VER \"[0-9.]*\"/!define VER \"$VER\"/" installer.nsi
rm -rf app dist && cp -r "$ROOT/app" app && npm install --no-audit --no-fund && npm i --no-save resedit@2 pe-library
npx electron-builder --win dir --x64 && node seticon.mjs && "$MAKENSIS" -V2 installer.nsi
cp dist/FPSpaint-Setup-$VER.exe "$OUT/"
echo "Listo: $OUT"
