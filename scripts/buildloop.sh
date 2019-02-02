#!/bin/bash

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null && pwd )"
ROOT=$DIR/..
APPROOT=$ROOT/app
MOBILEROOT=$ROOT/mobile
BUILDROOT=$ROOT/build
DEPLOYROOT=$ROOT/deploy

chsum1=""
mobchsum1=""
jschsum1=""

while [[ true ]]
do
    
    chsum2=`find $APPROOT -type f -exec md5 {} \;`
    mobchsum2=`find $MOBILEROOT/www -type f -exec md5 {} \;`
    jschsum2=`find $APPROOT/js -type f -exec md5 {} \;`

    if [[ $chsum1 != $chsum2 ]] ; then      
        $DIR/build/css.sh
        $DIR/build/static.sh
        $DIR/build/html.sh
        chsum1=$chsum2
    fi

    if [[ $mobchsum1 != $mobchsum2 ]] ; then      
        $DIR/build/mobile.sh
        mobchsum1=$mobchsum2
    fi
    
    if [[ $jschsum1 != $jschsum2 ]] ; then      
        $DIR/build/javascript.sh
        jschsum1=$jschsum2
    fi

    sleep 3

done
