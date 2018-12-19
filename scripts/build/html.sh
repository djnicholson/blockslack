#!/bin/bash

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null && pwd )"
ROOT=$DIR/../..
APPROOT=$ROOT/app
BUILDROOT=$ROOT/build
DEPLOYROOT=$ROOT/deploy

echo Crunching HTML...
cat $APPROOT/html/*.html > $BUILDROOT/index.html
cat $BUILDROOT/index.html | html-minifier --collapse-whitespace --collapse-inline-tag-whitespace --conservative-collapse --remove-comments --process-scripts "text/x-template" > $DEPLOYROOT/index.html
