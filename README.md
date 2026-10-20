<h1 align="center"><a href="https://github.com/mcguirepr89/BirdNET-Pi/blob/main/LICENSE">Review the license!!</a></h1>
<h1 align="center">You may not use BirdNET-Pi to develop a commercial product!!!!</h1>
<h1 align="center">
  BirdNET-Book
</h1>
<p align="center">
A realtime acoustic bird classification system for the Raspberry Pi 5, 4B, 400, 3B+, and 0W2
</p>
<p align="center">
  <img src="https://user-images.githubusercontent.com/60325264/140656397-bf76bad4-f110-467c-897d-992ff0f96476.png" />
</p>
<p align="center">
Icon made by <a href="https://www.freepik.com" title="Freepik">Freepik</a> from <a href="https://www.flaticon.com/" title="Flaticon">www.flaticon.com</a>
</p>

## About this fork:
I've been building on [mcguirepr89's](https://github.com/mcguirepr89/BirdNET-Pi) most excellent work to further update and improve BirdNET-Pi. Maybe someone will find it useful.

Changes include:

 - Backup & Restore
 - Web ui is much more responsive
 - Daily charts now include all species, not just top/bottom 10
 - Bump apprise version, so more notification type are possible
 - Swipe events on Daily Charts (by @croisez)
 - Support for 'Species range model V2.4 - V2'
 - Bookworm and Trixie support
 - Experimental support for writing transient files to tmpfs
 - Rework analysis to consolidate analysis/server/extraction. Should make analysis more robust and slightly more efficient, especially on installations with a large number of recordings
 - Bump tflite_runtime to 2.17.1, it is faster
 - Rework daily_plot.py (chart_viewer) to run as a daemon to avoid the very expensive startup
 - Lots of fixes & cleanups

!! note: see 'Migrating' on how to migrate from mcguirepr89

## Introduction
BirdNET-Pi is built on the [BirdNET framework](https://github.com/kahst/BirdNET-Analyzer) by [**@kahst**](https://github.com/kahst) <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/"><img src="https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg"></a> using [pre-built TFLite binaries](https://github.com/PINTO0309/TensorflowLite-bin) by [**@PINTO0309**](https://github.com/PINTO0309) . It is able to recognize bird sounds from a USB microphone or sound card in realtime and share its data with the rest of the world.

Check out birds from around the world
- [BirdWeather](https://app.birdweather.com)<br>

## Features
* **24/7 recording and automatic identification** of bird songs, chirps, and peeps using BirdNET machine learning
* **Automatic extraction and cataloguing** of bird clips from full-length recordings
* **Tools to visualize your recorded bird data** and analyze trends
* **Live audio stream and spectrogram**
* **Automatic disk space management** that periodically purges old audio files
* [BirdWeather](https://app.birdweather.com) integration -- you can request a BirdWeather ID from BirdNET-Pi's "Tools" > "Settings" page
* FTP server included
* SQLite3 Database
* [Apprise Notifications](https://github.com/caronc/apprise) supporting 90+ notification platforms
* Localization supported

## Web UI
This fork's web interface lives entirely in [`web-ui/`](web-ui/), a TanStack Start application. The legacy PHP dashboard, Streamlit stats page, GoTTY web terminal, Adminer, and phpSysInfo from upstream BirdNET-Pi have been removed.

### Web UI password

Settings, Species Control, and Review require a password. Everything else -- detections,
species, stats, timeline, learn -- stays public, so you can share your station without
handing over its controls.

There is no default password. The installer asks you to choose one; until one is set, nobody
can sign in, and the Account page says so. Set or change it any time with:

```
sudo ./scripts/set_web_ui_password.sh
```

It prompts twice without echoing, so the password never reaches your shell history. Minimum
12 characters. Changing the password signs out every device; the Account page also has a
"Sign out all devices" button that does so without changing it.

The password is stored only as a salted scrypt hash, in `/etc/birdnet/web-ui/auth.conf`
(mode 0600, in a directory owned by the web UI's account). It is never stored in plaintext, is kept out of `birdnet.conf` and
`firstrun.ini`, and is excluded from backup archives. If you forget it, re-run the script
over SSH -- there is no reset through the browser, by design.

### Before exposing this station to the internet

The gate is built for it, but two things are required first:

1. **TLS in front of it** -- a Cloudflare Tunnel, Tailscale, or Caddy with a certificate.
   Over plain HTTP the password and the session cookie are readable by anyone on the network
   path, and hashing at rest does not help with that. This one cannot be skipped.
2. **`WEB_UI_TRUSTED_PROXY=1`** set for the web UI (`sudo systemctl edit birdnet_web_ui`,
   then `Environment=WEB_UI_TRUSTED_PROXY=1`), so that failed-unlock throttling sees real
   client addresses rather than your proxy's. Without it every request appears to come from
   one address; with it set but no proxy actually in front, addresses can be spoofed.

## Requirements
* A Raspberry Pi 5, Raspberry 4B, Raspberry Pi 400, Raspberry Pi 3B+, or Raspberry Pi 0W2 (The 3B+ and 0W2 must run on RaspiOS-ARM64-**Lite**)
* An SD Card with the **_64-bit version of RaspiOS_** installed (please use Trixie) -- Lite is recommended, but the installation works on RaspiOS-ARM64-Full as well. Downloads available within the [Raspberry Pi Imager](https://www.raspberrypi.com/software/).
* A USB Microphone or Sound Card

## Installation
[A comprehensive installation guide is available here](https://github.com/mcguirepr89/BirdNET-Pi/wiki/Installation-Guide). This guide is slightly out-dated: make sure to pick Bookworm, also the curl command is still pointing to mcguirepr89's repo.

Please note that installing BirdNET-Pi on top of other servers is not supported. If this is something that you require, please open a discussion for your idea and inquire about how to contribute to development.

[Raspberry Pi 3B[+] and 0W2 installation guide available here](https://github.com/mcguirepr89/BirdNET-Pi/wiki/RPi0W2-Installation-Guide)

The system can be installed with:
```
curl -s https://raw.githubusercontent.com/CalebLovell/BirdNET-Book/main/newinstaller.sh | bash
```
The installer takes care of any and all necessary updates, so you can run that as the very first command upon the first boot, if you'd like.

It installs the newest release (or `main`, while there are none), Node 22 in
`/opt/birdnet-node`, and the web UI as `birdnet_web_ui.service` on port 80.

The installation creates a log in `$HOME/installation-$(date "+%F").txt`.
## Access
The BirdNET-Pi can be accessed from any web browser on the same network:
- http://birdnetpi.local OR your Pi's IP address

Please take a look at the [wiki](https://github.com/mcguirepr89/BirdNET-Pi/wiki) and [discussions](https://github.com/mcguirepr89/BirdNET-Pi/discussions) for information on
- [BirdNET-Pi's Deep Convolutional Neural Network(s)](https://github.com/mcguirepr89/BirdNET-Pi/wiki/BirdNET-Pi:-some-theory-on-classification-&-some-practical-hints)
- [making your installation public](https://github.com/mcguirepr89/BirdNET-Pi/wiki/Sharing-Your-BirdNET-Pi)
- [backing up and restoring your database](https://github.com/mcguirepr89/BirdNET-Pi/wiki/Backup-and-Restore-the-Database)
- [adjusting your sound card settings](https://github.com/mcguirepr89/BirdNET-Pi/wiki/Adjusting-your-sound-card)
- [suggested USB microphones](https://github.com/mcguirepr89/BirdNET-Pi/discussions/39)
- [building your own microphone](https://github.com/DD4WH/SASS/wiki/Stereo--(Mono)-recording-low-noise-low-cost-system)
- [privacy concerns and options](https://github.com/mcguirepr89/BirdNET-Pi/discussions/166)
- [beta testing](https://github.com/mcguirepr89/BirdNET-Pi/discussions/11)
- [and more!](https://github.com/mcguirepr89/BirdNET-Pi/discussions)


## Updating

Stations update from this repository's GitHub releases. Settings → Updates shows the
installed version and the newest release, with **Check now** and **Update to …**, and an
**Automatic updates** switch (on for new installs, `AUTOMATIC_UPDATE` in `birdnet.conf`).
With it on, `birdnet_update.timer` checks nightly between 3 and 5 AM and installs a new
release by itself -- but only one signed with a key the station trusts. Unsigned releases
always wait for someone to press Update.

From a shell:

```
update_birdnet.sh        # install the newest release now
update_birdnet.sh -c     # only check
```

An update downloads the release's prebuilt web UI beside the running one, moves the code
to the release's commit, and restarts. If the web UI doesn't answer afterwards, the station
goes back to the version it had. Progress is in `~/BirdNET-Pi-web/update-status.json` and
`journalctl -u birdnet_update_now`.

### How releases are trusted

Each release carries `release.json`, naming its commit and the sha256 of its web UI
bundle, signed with an SSH key. A station checks that signature against
`/etc/birdnet/release_signers`, copied from this repository's `release_signers` when the
station was installed and never replaced by an update -- so a release can't vouch for
itself, even from someone who gets into the GitHub account. The commit and the bundle must
then match what the signed manifest says.

### Releasing (for maintainers)

Releases are automatic. Every push to `main` runs `.github/workflows/release.yml`, which
checks the web UI and then lets [semantic-release](https://semantic-release.gitbook.io/)
read the [Conventional Commits](https://www.conventionalcommits.org/) since the last
release to pick the version:

| Commit message | Release |
| --- | --- |
| `fix(ui): …`, `perf: …` | patch: 1.4.0 → 1.4.1 |
| `feat(ui): …` | minor: 1.4.0 → 1.5.0 |
| `feat(ui)!: …`, or a `BREAKING CHANGE:` footer | major: 1.4.0 → 2.0.0 |
| `test:`, `docs:`, `chore:`, `refactor:`, `style:`, `ci:` | none |

The highest one among the new commits wins. When there is a release, it builds and signs
the web UI bundle (`scripts/package_release.sh`), tags the commit `vX.Y.Z`, and publishes
the GitHub release with notes grouped from the commit messages. A message that doesn't
follow the format simply doesn't count toward a release.

Set up signing once:

1. Make a key, without a passphrase, and keep the private half somewhere safe:
   `ssh-keygen -t ed25519 -N "" -C release@birdnet-book -f birdnet-book-release`
2. Add its public half to `release_signers` as
   `release@birdnet-book namespaces="birdnet-book-release" ssh-ed25519 AAAA…`
   (the first two fields of `birdnet-book-release.pub`), and commit it. Stations installed
   from then on trust it; ones installed earlier need it copied to
   `/etc/birdnet/release_signers` by hand.
3. Add the private key's full text as the repository secret `RELEASE_SIGNING_KEY`
   (Settings → Secrets and variables → Actions).

Until the secret exists, releases are published unsigned and nothing installs them
automatically.

## Backup and Restore
Use the web interface and go to "Tools" > "System Controls" > "Backup" or "Restore". Backup/Restore is primary meant for migrating your data for one system to another. Since the time required to create or restore a backup depends on the size of the data set and the speed of the storage, this could take quite a while.

Alternatively, the backup script can be used directly. These examples assume the backup medium is mounted on `/mnt`

To backup:
```commandline
./scripts/backup_data.sh -a backup -f /mnt/birds/backup-2024-07-09.tar
```
To restore:
```commandline
./scripts/backup_data.sh -a restore -f /mnt/birds/backup-2024-07-09.tar
```

## x86_64 support
x86_64 support is mainly there for developers or otherwise more Linux savvy people.
That being said, some pointers:
- Use Debian 12 or 13
- The user needs passwordless sudo

For Proxmox, a user has reported adding this in their `cpu-models.conf`, in order for the custom TFLite build to work.
```
cpu-model: BirdNet
    flags +sse4.1
    reported-model host
```

## Uninstallation
```
/usr/local/bin/uninstall.sh && cd ~ && rm -drf BirdNET-Pi
```
## Migrating
Before switching, make sure your installation is fully up-to-date. Also make sure to have a backup, that is also the only way to get back to the original BirdNET-Pi.
Please note that upgrading your underlying OS to Bookworm is not going to work. Please stick to Bullseye. If you do want Bookworm, you need to start from a fresh install and copy back your data. (remember the backup!)

Run these commands to migrate to this repo:
```
git remote remove origin
git remote add origin https://github.com/Nachtzuster/BirdNET-Pi.git
./scripts/update_birdnet.sh
```
## Troubleshooting and Ideas
*Hint: A lot of weird problems can be solved by simply restarting the core services. Do this from the web interface "Tools" > "Services" > "Restart Core Services"
Having trouble or have an idea? *Submit an issue for trouble* and a *discussion for ideas*. Please do *not* submit an issue as a discussion -- the issue tracker solicits information that is needed for anyone to help -- discussions are *not for issues*.

PLEASE search the repo for your issue before creating a new one. This repo has nothing to do with the validity of the detection results, so please do not start any issues around "False positives."

## Sharing
Please join a Discussion!! and please join [BirdWeather!!](https://app.birdweather.com)
I hope that if you find BirdNET-Pi has been worth your time, you will share your setup, results, customizations, etc. [HERE](https://github.com/mcguirepr89/BirdNET-Pi/discussions/69) and will consider [making your installation public](https://github.com/mcguirepr89/BirdNET-Pi/wiki/Sharing-Your-BirdNET-Pi).

## Homeassistant addon

BirdNET-Pi can also be run as a [Homeassistant](https://www.home-assistant.io/) addon through docker.
For more information : https://github.com/alexbelgium/hassio-addons/blob/master/birdnet-pi/README.md

## Docker

BirdNET-Pi can also be run as as a docker container.
For more information : https://github.com/alexbelgium/hassio-addons/blob/master/birdnet-pi/README_standalone.md

## Cool Links

- [Marie Lelouche's <i>Out of Spaces</i>](https://www.lestanneries.fr/exposition/marie-lelouche-out-of-spaces/) using BirdNET-Pi in post-sculpture VR! [Press Kit](https://github.com/mcguirepr89/BirdNET-Pi-assets/blob/main/dp_out_of_spaces_marie_lelouche_digital_05_01_22.pdf)
- [Research on noded BirdNET-Pi networks for farming](https://github.com/mcguirepr89/BirdNET-Pi-assets/blob/main/G23_Report_ModelBasedSysEngineering_FarmMarkBirdDetector_V1__Copy_.pdf)
- [PixCams Build Guide](https://pixcams.com/building-a-birdnet-pi-real-time-acoustic-bird-id-station/)
- [Core-Electronics](https://core-electronics.com.au/projects/bird-calls-raspberry-pi) Build Article
- [RaspberryPi.com Blog Post](https://www.raspberrypi.com/news/classify-birds-acoustically-with-birdnet-pi/)
- [MagPi Issue 119 Showcase Article](https://magpi.raspberrypi.com/issues/119/pdf)


### Internationalization:
The bird names are in English by default, but other localized versions are available thanks to the wonderful efforts of [@patlevin](https://github.com/patlevin) and Wikipedia. Use the web interface's "Tools" > "Settings" and select your "Database Language" to have the detections in your language.

[Internationalization](docs/translations.md)


## Screenshots
![Overview](docs/overview.png)
![Spectrogram](docs/spectrogram.png)


## :thinking:
Are you a lucky ducky with a spare Raspberry Pi? [Try Folding@home!](https://foldingathome.org/)
