#!/bin/bash

# Kill discord

ps -aux | grep "discord" | grep -v grep | awk '{print $2}' | xargs kill -9

# Download and install

OUTPUT="/tmp/discord-update.deb"

wget https://discord.com/api/download/stable\?platform\=linux\&format\=deb -O $OUTPUT

sudo dpkg -i $OUTPUT
