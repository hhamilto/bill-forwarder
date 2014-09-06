#! /bin/bash

echo Removing the bill-forwarder from the cron tab
crontab -l | sed "/node $(pwd | sed 's/\//\\\//g')\/main/d" | crontab -
