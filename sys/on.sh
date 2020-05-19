#!/bin/sh
echo "1" > /sys/class/gpio/gpio$1/value
