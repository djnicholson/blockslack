#!/bin/bash

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null && pwd )"
ROOT=$DIR/../..
APPROOT=$ROOT/app
MOBILEROOT=$ROOT/mobile
BUILDROOT=$ROOT/build
DEPLOYROOT=$ROOT/deploy

echo Building mobile apps...
pushd $MOBILEROOT
cordova prepare
cordova build
cordova build --release
cp platforms/android/app/build/outputs/apk/release/app-release-unsigned.apk $DEPLOYROOT/android.apk
popd
