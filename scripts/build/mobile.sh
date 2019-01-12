#!/bin/bash

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null && pwd )"
ROOT=$DIR/../..
APPROOT=$ROOT/app
MOBILEROOT=$ROOT/mobile
BUILDROOT=$ROOT/build
DEPLOYROOT=$ROOT/deploy

KEYSTORE=~/blockslack.keystore

echo Building mobile apps...
pushd $MOBILEROOT
cordova prepare
cordova-icon
cordova-splash
cordova build --release --buildFlag="-UseModernBuildSystem=0"
cp platforms/android/app/build/outputs/apk/release/app-release-unsigned.apk $DEPLOYROOT/android.apk
jarsigner -verbose -sigalg SHA1withRSA -digestalg SHA1 -keystore $KEYSTORE -storepass blockslack $DEPLOYROOT/android.apk blockslack
~/Library/Android/sdk/build-tools/28.0.3/zipalign -v 4 $DEPLOYROOT/android.apk $DEPLOYROOT/android-aligned.apk
mv $DEPLOYROOT/android-aligned.apk $DEPLOYROOT/android.apk
popd
