#!/bin/bash

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null && pwd )"
ROOT=$DIR/../..
APPROOT=$ROOT/app
BUILDROOT=$ROOT/build
DEPLOYROOT=$ROOT/deploy

echo -n Crunching JavaScript...
cat $APPROOT/js/*.js > $BUILDROOT/all.js
babel --compact false $BUILDROOT/all.js > $BUILDROOT/all.no-es6.js
minify $BUILDROOT/all.js -o $DEPLOYROOT/all.js 
minify $BUILDROOT/all.no-es6.js -o $DEPLOYROOT/all.no-es6.js 
echo Done
