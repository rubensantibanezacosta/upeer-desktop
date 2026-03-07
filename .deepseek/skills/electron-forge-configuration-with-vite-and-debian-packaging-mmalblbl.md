---
title: Electron Forge Configuration with Vite and Debian Packaging
source: https://www.electronforge.io/config/makers
tags:
  - electron
  - forge
  - packaging
  - debian
  - rpm
  - vite
createdAt: 2026-03-03T12:34:56.049Z
updatedAt: 2026-03-03T12:34:56.049Z
---

# Electron Forge Configuration with Vite and Debian Packaging

**Source:** https://www.electronforge.io/config/makers

---

# Electron Forge Configuration Guide for RevelNest

## Basic Configuration Structure

```typescript
import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import * as path from 'path';

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    extraResource: [
      './resources/bin',
      './drizzle',
      './install-scripts',
      './assets'
    ],
    name: 'revelnest-chat',
    executableName: 'revelnest-chat',
    icon: './assets/icon'
  },
  rebuildConfig: {},
  makers: [
    // Windows
    new MakerSquirrel({}),
    
    // macOS
    new MakerZIP({}, ['darwin']),
    
    // Linux - Debian
    new MakerDeb({
      options: {
        name: 'revelnest-chat',
        productName: 'RevelNest Chat P2P',
        icon: './resources/icon.png',
        categories: ['Network', 'Utility'],
        maintainer: 'RevelNest Team',
        description: 'Decentralized P2P chat with Yggdrasil mesh network',
        productDescription: 'Fully decentralized chat application using Yggdrasil mesh networks for private and secure communications without central servers.',
        bin: 'revelnest-chat',
        scripts: {
          postinst: path.resolve(__dirname, 'install-scripts/debian/postinst'),
          postrm: path.resolve(__dirname, 'install-scripts/debian/postrm'),
          prerm: path.resolve(__dirname, 'install-scripts/debian/prerm')
        },
        mimeType: ['x-scheme-handler/revelnest'],
        section: 'net'
      }
    }),
    
    // Linux - RPM (requires rpmbuild)
    new MakerRpm({
      options: {
        name: 'revelnest-chat',
        productName: 'RevelNest Chat P2P',
        icon: './resources/icon.png',
        categories: ['Network', 'Utility'],
        maintainer: 'RevelNest Team',
        description: 'Decentralized P2P chat with Yggdrasil mesh network',
        bin: 'revelnest-chat',
        extraFiles: [
          {
            src: './resources/bin/linux-x64/yggdrasil',
            dest: '/usr/lib/revelnest/yggdrasil',
            mode: 0o755
          },
          {
            src: './install-scripts/systemd/revelnest-yggdrasil.service',
            dest: '/usr/lib/systemd/system/revelnest-yggdrasil.service',
            mode: 0o644
          }
        ]
      }
    })
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
```

## Key Configuration Points

### 1. Packager Config
- `asar: true`: Packages app resources in ASAR archive
- `extraResource`: Files to include outside ASAR (binaries, configs, assets)
- `icon`: Application icon (without extension, Forge auto-detects .png/.icns/.ico)

### 2. Makers Configuration

#### Debian Maker
- **scripts**: Control installation lifecycle
  - `postinst`: After installation (copy binaries, setup systemd)
  - `prerm`: Before removal (stop service)
  - `postrm`: After removal (cleanup)
- **mimeType**: Register custom URL scheme `revelnest://`
- **categories**: Desktop categories for app launchers

#### RPM Maker
- **extraFiles**: Direct file copying with permissions
- Requires `rpmbuild` installed on build system

### 3. Vite Plugin
- Separate builds for main process, preload scripts, and renderer
- Uses existing Vite config files

### 4. Fuses Plugin
- Security hardening for Electron
- Disables Node.js integration in renderer
- Enables ASAR integrity validation

## Installation Scripts Structure

```
install-scripts/
├── debian/
│   ├── postinst    # Post-installation script
│   ├── prerm       # Pre-removal script  
│   └── postrm      # Post-removal script
└── systemd/
    └── revelnest-yggdrasil.service
```

## Common Issues and Solutions

### 1. Missing Binaries in Package
- Ensure `extraResource` includes correct paths
- Binaries must be present at build time

### 2. Icon Not Showing
- Provide icons in multiple formats (.png, .icns, .ico)
- Place in `assets/` directory

### 3. Debian Scripts Not Executing
- Scripts must be executable (`chmod +x`)
- Paths must be absolute using `path.resolve()`

### 4. RPM Build Fails
- Install `rpmbuild`: `sudo apt-get install rpm` or `sudo yum install rpm-build`
- Comment out RPM maker if not needed

## Building Commands

```bash
# Development build
npm run make

# Production build for current platform
npm run package

# Build for specific platform
npm run package -- --platform=linux --arch=x64

# Make installers for all configured makers
npm run make -- --platform=linux --arch=x64
```

## Best Practices

1. **Test scripts locally** before packaging
2. **Use path.resolve()** for script paths
3. **Keep binaries platform-specific** in resources/bin/
4. **Version icons** for different platforms
5. **Enable ASAR** for production builds
6. **Use Fuses** for security hardening
7. **Test installers** in clean VM environments
