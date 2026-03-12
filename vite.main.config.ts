import { defineConfig } from 'vite';
import type { Plugin } from 'vite';

/**
 * @mapbox/node-pre-gyp (dep transitiva de @journeyapps/sqlcipher → node-pre-gyp)
 * importa estos paquetes SOLO en sus tests internos (s3_setup.js). No están
 * instalados en producción.
 *
 * Cuando Rollup's @rollup/plugin-commonjs procesa s3_setup.js, los convierte en
 * imports ESM con el sufijo ?commonjs-external. Si se dejan como external, Node.js
 * falla al cargarlos con ERR_MODULE_NOT_FOUND. Por eso los interceptamos antes de
 * que el plugin CJS los marque como externos, devolviendo módulos vacíos.
 */
const TEST_ONLY_STUBS = ['mock-aws-s3', 'aws-sdk', 'nock'];

function stubTestOnlyPackages(): Plugin {
    return {
        name: 'stub-test-only-packages',
        enforce: 'pre',
        resolveId(id) {
            // El plugin CJS a veces añade el sufijo ?commonjs-external antes de
            // que nuestro resolveId lo intercepte. Eliminamos el sufijo para comparar.
            const bareId = id.split('?')[0];
            if (TEST_ONLY_STUBS.includes(bareId)) {
                return '\0stub:' + bareId;
            }
        },
        load(id) {
            if (id.startsWith('\0stub:')) {
                // ESM: el bundle es format:'es', no existe module/require
                return 'export default {}; export const S3 = {};\n';
            }
        },
    };
}

function resolveBetterSqlite3(): Plugin {
    return {
        name: 'resolve-better-sqlite3',
        enforce: 'pre',
        resolveId(id) {
            const bareId = id.split('?')[0];
            if (bareId === 'better-sqlite3') {
                // Redirect to better-sqlite3-multiple-ciphers
                return 'better-sqlite3-multiple-ciphers';
            }
        },
    };
}

// https://vitejs.dev/config
export default defineConfig({
    plugins: [stubTestOnlyPackages(), resolveBetterSqlite3()],
    build: {
        lib: {
            entry: 'src/main.ts',
            formats: ['es'],
            fileName: 'main',
        },
        rollupOptions: {
            // Electron Forge añade vía mergeConfig: electron, electron/common y
            // todos los builtins de Node.js. Aquí solo completamos con los paquetes
            // nativos que usan __dirname para localizar sus binarios .node y que
            // NO deben bundlearse (externalizarlos hace que Node.js los resuelva
            // desde node_modules con el __dirname correcto en tiempo de ejecución).
            // @journeyapps/sqlcipher SÍ se bundlea: el plugin CJS sustituye su
            // __dirname con el path absoluto del paquete en node_modules.
            external: [
                'electron',
                'electron/main',
                'electron/common',
                'electron-squirrel-startup',
                // Módulos nativos con binarios .node: se cargan desde node_modules
                // en tiempo de ejecución. No se pueden bundlear porque usan
                // require(dinamicPath) para localizar el binario .node.
                '@journeyapps/sqlcipher', // mantenido por si se reintroduce sqlcipher
                'better-sqlite3-multiple-ciphers',
                'sodium-native',
                '@vscode/sudo-prompt',
            ],
        },
    },
});
