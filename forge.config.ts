import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
// import { MakerRpm } from '@electron-forge/maker-rpm';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import * as path from 'path';

const config: ForgeConfig = {
  packagerConfig: {
    asar: {
      unpack: '**/node_modules/{sharp,@img,@ffmpeg-installer}/**',
    },
    extraResource: [
      './resources/bin',
      './drizzle',
      './install-scripts',
      './assets'
    ],
    // Configuración adicional para el nombre de la aplicación
    name: 'upeer-chat',
    executableName: 'upeer-chat',
    icon: './assets/icon'
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({}),
    new MakerZIP({}, ['darwin']),
    // Debian para x64
    new MakerDeb({
      // @ts-ignore
      options: {
        name: 'upeer-chat',
        productName: 'uPeer P2P',
        icon: './resources/icon.png',
        categories: ['Network', 'Utility'],
        maintainer: 'upeer Team',
        description: 'Chat descentralizado P2P con red mesh Yggdrasil',
        productDescription: 'Aplicación de chat completamente descentralizada que utiliza redes mesh Yggdrasil para comunicaciones privadas y seguras sin servidores centrales.',
        bin: 'upeer-chat',
        scripts: {
          postinst: path.resolve(__dirname, 'install-scripts/debian/postinst'),
          postrm: path.resolve(__dirname, 'install-scripts/debian/postrm'),
          prerm: path.resolve(__dirname, 'install-scripts/debian/prerm')
        },
        // extraFiles no está soportado por electron-installer-debian
        // Usamos scripts postinst para copiar archivos necesarios
        mimeType: [
          'x-scheme-handler/upeer'
        ],
        section: 'net'
      }
    }),
    // Debian para arm64
    new MakerDeb({
      // @ts-ignore
      options: {
        name: 'upeer-chat',
        productName: 'uPeer P2P',
        icon: './resources/icon.png',
        categories: ['Network', 'Utility'],
        maintainer: 'upeer Team',
        description: 'Chat descentralizado P2P con red mesh Yggdrasil',
        productDescription: 'Aplicación de chat completamente descentralizada que utiliza redes mesh Yggdrasil para comunicaciones privadas y seguras sin servidores centrales.',
        bin: 'upeer-chat',
        scripts: {
          postinst: path.resolve(__dirname, 'install-scripts/debian/postinst'),
          postrm: path.resolve(__dirname, 'install-scripts/debian/postrm'),
          prerm: path.resolve(__dirname, 'install-scripts/debian/prerm')
        },
        // extraFiles no está soportado por electron-installer-debian
        // Usamos scripts postinst para copiar archivos necesarios
        mimeType: [
          'x-scheme-handler/upeer'
        ],
        section: 'net'
      }
    }),
    // MakerDeb para arm64 (comentado - usar el mismo paquete para ambas arquitecturas)
    // new MakerDeb({
    //   options: {
    //     name: 'upeer-chat',
    //     productName: 'uPeer P2P',
    //     icon: './resources/icon.png',
    //     maintainer: 'upeer Team',
    //     homepage: 'https://upeer.chat',
    //     categories: ['Network', 'InstantMessaging'],
    //     mimeTypes: [
    //       'x-scheme-handler/upeer'
    //     ],
    //     section: 'net'
    //   },
    //   arch: 'arm64'
    // }),
  ],
  plugins: [
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
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
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
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