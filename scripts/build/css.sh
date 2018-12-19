#!/bin/bash

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null && pwd )"
ROOT=$DIR/../..
APPROOT=$ROOT/app
BUILDROOT=$ROOT/build
DEPLOYROOT=$ROOT/deploy

echo Crunching CSS...
dart-sass $APPROOT/scss/_main.scss --no-source-map > $BUILDROOT/all.css
dart-sass $APPROOT/scss/_main.scss --no-source-map -s compressed > $DEPLOYROOT/all.css
