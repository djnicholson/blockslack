#!/bin/bash

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null && pwd )"
ROOT=$DIR/../..
APPROOT=$ROOT/app
BUILDROOT=$ROOT/build
DEPLOYROOT=$ROOT/deploy

$DIR/css.sh
$DIR/static.sh
$DIR/mobile.sh
$DIR/javascript.sh
$DIR/html.sh
