#!/bin/sh

value=`cat /sys/class/gpio/gpio$1/value`
echo "$value"
