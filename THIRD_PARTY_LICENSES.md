# Third Party Licenses

This project uses the following third-party software:

---

## FFmpeg

**Used for:** Video and audio metadata stripping (privacy protection)

**License:** LGPL-2.1 (Lesser General Public License)

**Copyright:** FFmpeg developers

**Source:** https://ffmpeg.org/

**Bundled via:** [@ffmpeg-installer/ffmpeg](https://github.com/kribblo/node-ffmpeg-installer)

FFmpeg is licensed under the GNU Lesser General Public License (LGPL) version 2.1 or later.
The source code is available at https://ffmpeg.org/download.html

As required by LGPL-2.1:
- Users may replace the FFmpeg binary with their own version
- The FFmpeg source code is available at the link above
- This notice is provided to comply with attribution requirements

---

## Sharp (libvips)

**Used for:** Image metadata stripping (EXIF/GPS removal)

**License:** Apache-2.0

**Copyright:** Lovell Fuller and contributors

**Source:** https://github.com/lovell/sharp

Licensed under the Apache License, Version 2.0. You may obtain a copy of the License at
http://www.apache.org/licenses/LICENSE-2.0

---

## Yggdrasil / yggstack

**Used for:** Decentralized mesh networking

**License:** LGPL-3.0

**Copyright:** Yggdrasil Network

**Source:** https://github.com/yggdrasil-network/yggdrasil-go

---

## sodium-native

**Used for:** End-to-end encryption (E2EE)

**License:** MIT

**Copyright:** sodium-friends

**Source:** https://github.com/sodium-friends/sodium-native

---

## Full Dependency Licenses

For a complete list of all dependencies and their licenses, run:

```bash
npx license-checker --summary
```

Or for detailed output:

```bash
npx license-checker --json > licenses.json
```
