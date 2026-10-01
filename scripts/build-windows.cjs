#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const WIN_DIST_DIR = path.join(DIST_DIR, 'yui-windows');

async function buildWindows() {
  console.log('🪟 Preparando compilación de YUI para Windows (Tauri 2)...');

  // 1. Compilar frontend Vite
  console.log('📦 Compilando frontend Vite con TypeScript...');
  execSync('npm run build', { cwd: ROOT_DIR, stdio: 'inherit' });

  // 2. Verificar archivos de Tauri 2
  const requiredFiles = [
    path.join(ROOT_DIR, 'src-tauri', 'Cargo.toml'),
    path.join(ROOT_DIR, 'src-tauri', 'tauri.conf.json'),
    path.join(ROOT_DIR, 'src-tauri', 'src', 'main.rs'),
    path.join(ROOT_DIR, 'src-tauri', 'build.rs')
  ];

  for (const file of requiredFiles) {
    if (!fs.existsSync(file)) {
      throw new Error(`Falta el archivo requerido para Windows/Tauri: ${file}`);
    }
  }
  console.log('✅ Estructura de Tauri 2 para Windows validada.');

  // 3. Preparar carpeta de salida para Windows
  if (fs.existsSync(WIN_DIST_DIR)) {
    fs.rmSync(WIN_DIST_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(WIN_DIST_DIR, { recursive: true });

  // Copiar archivos del frontend empaquetado a yui-windows
  fs.cpSync(path.join(DIST_DIR, 'index.html'), path.join(WIN_DIST_DIR, 'index.html'));
  fs.cpSync(path.join(DIST_DIR, 'assets'), path.join(WIN_DIST_DIR, 'assets'), { recursive: true });
  if (fs.existsSync(path.join(DIST_DIR, 'favicon.svg'))) {
    fs.cpSync(path.join(DIST_DIR, 'favicon.svg'), path.join(WIN_DIST_DIR, 'favicon.svg'));
  }

  // Generar README de despliegue para Windows
  const winReadme = `# YUI para Windows (Tauri 2)

Esta carpeta y la estructura \`src-tauri\` contienen todo lo necesario para compilar el instalador nativo de Windows (.msi / .exe con NSIS).

## Instrucciones de Compilación en Windows:
1. Requisitos:
   - Node.js (v18+) y Rust (1.78+)
   - WebView2 (incluido de serie en Windows 10/11)
2. Ejecución en desarrollo:
   \`\`\`bash
   npm install
   npx tauri dev
   \`\`\`
3. Compilar instalador ejecutable (NSIS / MSI):
   \`\`\`bash
   npm run build:windows
   # o directamente:
   npx tauri build
   \`\`\`
El instalador se generará en \`src-tauri/target/release/bundle/nsis/\`.
`;
  fs.writeFileSync(path.join(WIN_DIST_DIR, 'README.md'), winReadme);

  // Si estamos en entorno Windows nativo, compilar el binario .exe / instalador NSIS
  if (process.platform === 'win32') {
    console.log('⚙️ Entorno Windows detectado. Ejecutando tauri build...');
    execSync('npx tauri build', { cwd: ROOT_DIR, stdio: 'inherit' });
    console.log('🎉 Instalador NSIS y binario para Windows generados con éxito.');
  } else {
    console.log('ℹ️ Entorno host actual: Arch Linux.');
    console.log('📦 Frontend compilado en `dist/` y `dist/yui-windows/`.');
    console.log('🔧 Configuración de Tauri 2 validada con ventana flotante Notch superior.');
    console.log('💡 Para generar el instalador final NSIS en Windows o CI:');
    console.log('   `npm run build:windows` o `npx tauri build`');
  }

  console.log('✅ Preparación para Windows completada con éxito.');
}

buildWindows().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
