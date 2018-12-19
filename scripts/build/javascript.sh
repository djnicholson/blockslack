#!/bin/bash

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null && pwd )"
ROOT=$DIR/../..
APPROOT=$ROOT/app
BUILDROOT=$ROOT/build
DEPLOYROOT=$ROOT/deploy

echo -n Crunching JavaScript...
cat $APPROOT/js/*.js > $BUILDROOT/all.js
minify $BUILDROOT/all.js -o $DEPLOYROOT/all.js 
echo Done
