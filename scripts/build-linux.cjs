#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const asar = require('@electron/asar');

const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const OUTPUT_DIR = path.join(DIST_DIR, 'yui-linux');
const BIN_DIR = path.join(ROOT_DIR, 'bin');
const STAGING_DIR = path.join(DIST_DIR, '.staging-linux');

async function build() {
  console.log('🚀 Iniciando compilación de YUI para Arch Linux...');

  // 1. Compilar frontend Vite
  console.log('📦 Compilando frontend Vite con TypeScript...');
  execSync('npm run build', { cwd: ROOT_DIR, stdio: 'inherit' });

  // 2. Preparar directorios
  if (fs.existsSync(STAGING_DIR)) {
    fs.rmSync(STAGING_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(STAGING_DIR, { recursive: true });
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.mkdirSync(BIN_DIR, { recursive: true });

  // 3. Copiar archivos necesarios para el paquete
  console.log('📁 Preparando bundle de Electron...');
  
  // Minimal package.json for electron runtime
  const pkg = {
    name: 'yui-companion',
    version: '1.0.0',
    description: 'YUI Desktop Companion for Arch Linux',
    main: 'electron/main.cjs'
  };
  fs.writeFileSync(path.join(STAGING_DIR, 'package.json'), JSON.stringify(pkg, null, 2));

  // Copy electron folder
  fs.cpSync(path.join(ROOT_DIR, 'electron'), path.join(STAGING_DIR, 'electron'), { recursive: true });

  // Copy compiled dist
  const stagingDist = path.join(STAGING_DIR, 'dist');
  fs.mkdirSync(stagingDist, { recursive: true });
  fs.cpSync(path.join(DIST_DIR, 'index.html'), path.join(stagingDist, 'index.html'));
  fs.cpSync(path.join(DIST_DIR, 'assets'), path.join(stagingDist, 'assets'), { recursive: true });
  if (fs.existsSync(path.join(DIST_DIR, 'favicon.svg'))) {
    fs.cpSync(path.join(DIST_DIR, 'favicon.svg'), path.join(stagingDist, 'favicon.svg'));
  }

  // 4. Empaquetar con ASAR
  const asarDest = path.join(OUTPUT_DIR, 'app.asar');
  const binAsarDest = path.join(BIN_DIR, 'app.asar');
  console.log(`📦 Creando paquete ASAR en: ${asarDest}`);
  await asar.createPackage(STAGING_DIR, asarDest);
  fs.copyFileSync(asarDest, binAsarDest);
  console.log(`📦 Copiado respaldo ASAR en: ${binAsarDest}`);

  // 5. Crear script ejecutable lanzador
  const launcherContent = `#!/usr/bin/env bash
set -e

# Base directory
SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "\$SCRIPT_DIR/.." && pwd)"

# Clean stale singleton locks if no electron process running YUI is alive or if lock PID is dead
LOCK_FILE="$HOME/.config/yui-companion/SingletonLock"
if [ -L "$LOCK_FILE" ] || [ -f "$LOCK_FILE" ]; then
  LOCK_TARGET=$(readlink "$LOCK_FILE" 2>/dev/null || true)
  LOCK_PID=$(echo "$LOCK_TARGET" | grep -oE '[0-9]+$' || true)
  if [ -n "$LOCK_PID" ]; then
    if ! kill -0 "$LOCK_PID" 2>/dev/null; then
      rm -f "$HOME/.config/yui-companion/SingletonLock" "$HOME/.config/yui-companion/SingletonSocket" "$HOME/.config/yui-companion/SingletonCookie" 2>/dev/null || true
    fi
  else
    rm -f "$HOME/.config/yui-companion/SingletonLock" "$HOME/.config/yui-companion/SingletonSocket" "$HOME/.config/yui-companion/SingletonCookie" 2>/dev/null || true
  fi
fi
RUNNING_YUI=$(pgrep -f "electron.*(yui|app\\.asar)" 2>/dev/null || true)
if [ -z "$RUNNING_YUI" ]; then
  rm -f "$HOME/.config/yui-companion/SingletonLock" "$HOME/.config/yui-companion/SingletonSocket" "$HOME/.config/yui-companion/SingletonCookie" 2>/dev/null || true
  rm -f "$HOME/.config/Electron/SingletonLock" "$HOME/.config/Electron/SingletonSocket" "$HOME/.config/Electron/SingletonCookie" 2>/dev/null || true
fi

# Target ASAR package
ASAR_PATH="\$PROJECT_ROOT/dist/yui-linux/app.asar"
if [ ! -f "\$ASAR_PATH" ]; then
  ASAR_PATH="\$SCRIPT_DIR/app.asar"
fi

# Detect Electron on Arch Linux
if command -v electron42 >/dev/null 2>&1; then
  ELECTRON_BIN="electron42"
elif command -v electron43 >/dev/null 2>&1; then
  ELECTRON_BIN="electron43"
elif command -v electron >/dev/null 2>&1; then
  ELECTRON_BIN="electron"
else
  echo "Error: No se encontró electron42 ni electron en el sistema Arch Linux." >&2
  echo "Instálalo con: sudo pacman -S electron42" >&2
  exit 1
fi

# Linux Wayland / X11 flags for smooth transparency and top-edge positioning
FLAGS=()
if [ -n "\$WAYLAND_DISPLAY" ]; then
  FLAGS+=("--ozone-platform-hint=auto")
fi

# RAM and V8 memory optimization flags
FLAGS+=(
  '--js-flags=--max-old-space-size=128'
  '--disable-renderer-backgrounding'
  '--disable-background-timer-throttling=false'
)

exec "\$ELECTRON_BIN" "\${FLAGS[@]}" "\$ASAR_PATH" "\$@"
`;

  const binPath = path.join(BIN_DIR, 'yui-linux');
  const distBinPath = path.join(OUTPUT_DIR, 'yui-linux');

  fs.writeFileSync(binPath, launcherContent, { mode: 0o755 });
  fs.writeFileSync(distBinPath, launcherContent, { mode: 0o755 });
  console.log(`✨ Ejecutable creado en: ${binPath}`);
  console.log(`✨ Ejecutable creado en: ${distBinPath}`);

  // 6. Crear archivo yui.desktop
  const iconPath = path.join(ROOT_DIR, 'public', 'favicon.svg');
  const desktopFileContent = `[Desktop Entry]
Name=YUI
Comment=Notch Companion Agent powered by Google Gemini
Exec=${binPath} %U
Icon=${iconPath}
Terminal=false
Type=Application
Categories=Utility;X-Assistant;
StartupWMClass=yui-companion
`;

  const rootDesktopPath = path.join(ROOT_DIR, 'yui.desktop');
  fs.writeFileSync(rootDesktopPath, desktopFileContent);
  console.log(`📄 Archivo de escritorio creado: ${rootDesktopPath}`);

  // Instalar en ~/.local/share/applications si existe
  const userAppsDir = path.join(process.env.HOME || '', '.local', 'share', 'applications');
  if (fs.existsSync(userAppsDir)) {
    const installedDesktopPath = path.join(userAppsDir, 'yui.desktop');
    fs.writeFileSync(installedDesktopPath, desktopFileContent);
    console.log(`🌟 Integrado en el menú de aplicaciones: ${installedDesktopPath}`);
  }

  // 7. Limpiar staging
  fs.rmSync(STAGING_DIR, { recursive: true, force: true });
  console.log('✅ Compilación de escritorio para Linux Arch finalizada con éxito.');
}

build().catch((err) => {
  console.error('❌ Error durante la compilación:', err);
  process.exit(1);
});
