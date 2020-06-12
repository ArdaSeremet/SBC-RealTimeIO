#!/bin/bash

[ ! -d "/sys/class/gpio/gpio$1" ] && echo "$1" > /sys/class/gpio/export
echo "in" > /sys/class/gpio/gpio$1/direction
