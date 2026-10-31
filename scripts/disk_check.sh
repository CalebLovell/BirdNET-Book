#!/usr/bin/env bash
set -x

source /etc/birdnet/birdnet.conf
used_percent() { df ${EXTRACTED} | tail -n1 | awk '{print $5}' | tr -d '%'; }
purge_threshold="${PURGE_THRESHOLD:-95}"

if [ "$(used_percent)" -ge "$purge_threshold" ]; then
  case $FULL_DISK in
    purge) echo "Removing the least confident recordings"
       $HOME/BirdNET-Pi/birdnet/bin/python3 $HOME/BirdNET-Pi/scripts/purge_recordings.py
       find ~/BirdSongs/ -type d -empty -mtime +90 -delete;;
    keep) echo "Stopping Core Services"
       /usr/local/bin/stop_core_services.sh;;
  esac
fi
sleep 1
if [ "$(used_percent)" -ge "$purge_threshold" ]; then
  case $FULL_DISK in
    purge) echo "Removing more data"
       rm -rfv ${PROCESSED}/*;;
    keep) echo "Stopping Core Services"
       /usr/local/bin/stop_core_services.sh;;
  esac
fi
