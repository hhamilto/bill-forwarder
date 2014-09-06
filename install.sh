#! /bin/bash

echo "Adding bill-forwarder to crontab"

echo "0 */1 * * *  node $(pwd)/main" | crontab -

#installs main to crontab (or it will)
