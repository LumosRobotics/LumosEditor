# Building Lumos Editor for Distribution

This guide explains how to build distributable packages of Lumos Editor for macOS, Windows, and Linux.

## Prerequisites

### All Platforms
- Node.js (v18 or later)
- npm (v8 or later)
- All dependencies installed: `npm install`

### macOS
- Xcode Command Line Tools: `xcode-select --install`
- (Optional) Apple Developer Account for code signing

### Windows
- Windows 10/11
- Visual Studio Build Tools or Visual Studio 2019+
- Python 3.x (for native module compilation)

### Linux
- Build essentials: `sudo apt-get install build-essential`
- Additional packages: `sudo apt-get install libx11-dev libxkbfile-dev libsecret-1-dev`

---

## Building for macOS (Current Platform)

### Quick Build (Unsigned)

Build for your current architecture (Intel or Apple Silicon):

```bash
npm run build
```

This creates:
- `dist/Lumos Editor-1.0.0.dmg` - DMG installer
- `dist/Lumos Editor-1.0.0-mac.zip` - ZIP archive
- `dist/mac/Lumos Editor.app` - Application bundle

### Universal Build (Intel + Apple Silicon)

Build a universal binary that runs natively on both Intel and Apple Silicon:

```bash
npm run build -- --universal
```

**Note:** This takes significantly longer as it builds for both architectures.

### Build Specific Architecture

For Intel only:
```bash
npm run build -- --x64
```

For Apple Silicon only:
```bash
npm run build -- --arm64
```

---

## Code Signing (macOS)

For distributing outside the App Store, you should code sign your app to avoid Gatekeeper warnings.

### Prerequisites
1. Apple Developer Account ($99/year)
2. Developer ID Application certificate installed in Keychain
3. Developer ID Installer certificate (for pkg format)

### Setting Up Code Signing

1. **Install your certificates:**
   - Log in to Apple Developer Portal
   - Download "Developer ID Application" certificate
   - Double-click to install in Keychain

2. **Configure signing in package.json:**

```json
"build": {
  "mac": {
    "identity": "Developer ID Application: Your Name (TEAM_ID)",
    "hardenedRuntime": true,
    "gatekeeperAssess": false,
    "entitlements": "build/entitlements.mac.plist",
    "entitlementsInherit": "build/entitlements.mac.plist"
  }
}
```

3. **Build with signing:**
```bash
CSC_NAME="Developer ID Application: Your Name (TEAM_ID)" npm run build
```

**Or set environment variables:**
```bash
export CSC_NAME="Developer ID Application: Your Name (TEAM_ID)"
npm run build
```

### Notarization (macOS 10.15+)

For macOS Catalina and later, apps must be notarized by Apple.

1. **Create app-specific password:**
   - Go to https://appleid.apple.com
   - Generate app-specific password

2. **Store credentials securely:**
```bash
xcrun notarytool store-credentials "lumos-notarize" \
  --apple-id "your-apple-id@example.com" \
  --team-id "YOUR_TEAM_ID" \
  --password "app-specific-password"
```

3. **Configure notarization in package.json:**
```json
"build": {
  "afterSign": "scripts/notarize.js",
  "mac": {
    "notarize": {
      "teamId": "YOUR_TEAM_ID"
    }
  }
}
```

4. **Create notarization script** (`scripts/notarize.js`):
```javascript
const { notarize } = require('@electron/notarize');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') {
    return;
  }

  const appName = context.packager.appInfo.productFilename;

  return await notarize({
    appBundleId: 'com.lumosrobotics.lumoseditor',
    appPath: `${appOutDir}/${appName}.app`,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_ID_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID,
  });
};
```

5. **Install notarization package:**
```bash
npm install --save-dev @electron/notarize
```

6. **Build and notarize:**
```bash
APPLE_ID="your-apple-id@example.com" \
APPLE_ID_PASSWORD="app-specific-password" \
APPLE_TEAM_ID="YOUR_TEAM_ID" \
npm run build
```

---

## Building for Windows (from Windows)

### One-time Setup

```bash
# Install dependencies (if not already done)
npm install

# Optional: Install Windows SDK for better icons
npm install --save-dev electron-builder-squirrel-windows
```

### Build

```bash
npm run build
```

This creates:
- `dist/Lumos Editor Setup 1.0.0.exe` - NSIS installer
- `dist/Lumos Editor 1.0.0.exe` - Portable executable

### Code Signing (Windows)

1. **Obtain a code signing certificate:**
   - Purchase from DigiCert, Sectigo, etc.
   - Or use a self-signed certificate for testing

2. **Configure in package.json:**
```json
"build": {
  "win": {
    "certificateFile": "path/to/certificate.pfx",
    "certificatePassword": "your-password"
  }
}
```

3. **Or use environment variables:**
```bash
set CSC_LINK=path\to\certificate.pfx
set CSC_KEY_PASSWORD=your-password
npm run build
```

---

## Building for Linux (from Linux)

### One-time Setup

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y build-essential libx11-dev libxkbfile-dev libsecret-1-dev

# Fedora/RHEL
sudo dnf install gcc-c++ make libX11-devel libxkbfile-devel libsecret-devel

# Install dependencies
npm install
```

### Build

```bash
npm run build
```

This creates:
- `dist/Lumos Editor-1.0.0.AppImage` - Universal Linux package
- `dist/lumos-editor_1.0.0_amd64.deb` - Debian/Ubuntu package
- `dist/lumos-editor-1.0.0.x86_64.rpm` - Fedora/RHEL package

---

## Cross-Platform Builds (Advanced)

You can build for multiple platforms from a single machine using Docker or CI/CD.

### Using Docker

```bash
# Build for Windows and Linux from macOS
docker run --rm -ti \
  --env-file <(env | grep -iE 'DEBUG|NODE_|ELECTRON_|YARN_|NPM_|CI|CIRCLE|TRAVIS_TAG|TRAVIS|TRAVIS_REPO_|TRAVIS_BUILD_|TRAVIS_BRANCH|TRAVIS_PULL_REQUEST_|APPVEYOR_|CSC_|GH_|GITHUB_|BT_|AWS_|STRIP|BUILD_') \
  --env ELECTRON_CACHE="/root/.cache/electron" \
  --env ELECTRON_BUILDER_CACHE="/root/.cache/electron-builder" \
  -v ${PWD}:/project \
  -v ~/.cache/electron:/root/.cache/electron \
  -v ~/.cache/electron-builder:/root/.cache/electron-builder \
  electronuserland/builder:wine \
  /bin/bash -c "npm install && npm run build -- --linux --win"
```

---

## Build Configuration Overview

Key configuration in `package.json`:

```json
{
  "build": {
    "appId": "com.lumosrobotics.lumoseditor",
    "productName": "Lumos Editor",

    "mac": {
      "target": ["dmg", "zip"],
      "arch": ["x64", "arm64"]
    },

    "win": {
      "target": ["nsis", "portable"],
      "arch": ["x64", "ia32"]
    },

    "linux": {
      "target": ["AppImage", "deb", "rpm"],
      "arch": ["x64", "arm64"]
    }
  }
}
```

---

## File Size Optimization

The built app includes the ARM GCC toolchain (~500MB), which makes the final package large.

### Reducing Size

1. **Remove unnecessary files:**
   - Edit `package.json` → `build.files` to exclude test files, docs, etc.

2. **Compress better:**
   ```json
   "build": {
     "compression": "maximum",
     "asar": true
   }
   ```

3. **Split toolchain as downloadable:**
   - Keep toolchain separate
   - Download on first launch
   - Reduces initial download size

---

## Distribution Channels

### macOS
- **Manual distribution:** Share DMG file directly
- **Homebrew Cask:** Submit to homebrew/cask
- **App Store:** Requires different signing/sandboxing

### Windows
- **Direct download:** Host installer on your website
- **Chocolatey:** Package manager for Windows
- **Microsoft Store:** Requires UWP packaging

### Linux
- **Direct download:** AppImage (no installation needed)
- **Package repositories:** Submit .deb and .rpm to repos
- **Snap Store:** Universal Linux app store
- **Flathub:** Flatpak distribution

---

## Testing the Build

Before distributing:

1. **Test installation:**
   ```bash
   # macOS
   open "dist/Lumos Editor-1.0.0.dmg"

   # Install to /Applications and test
   ```

2. **Test on clean machine:**
   - Use VM or ask friends to test
   - Verify no missing dependencies

3. **Check file associations:**
   - Verify .ino, .cpp, .c files open correctly

4. **Test serial port access:**
   - Connect MCU device
   - Verify ports are detected

---

## Troubleshooting

### macOS: "App is damaged and can't be opened"
- **Cause:** App not signed or notarized
- **Fix for testing:** `xattr -cr "/Applications/Lumos Editor.app"`
- **Fix for distribution:** Code sign and notarize

### macOS: Serial ports not accessible
- **Cause:** Missing entitlements
- **Fix:** Verify `entitlements.mac.plist` includes USB/serial entitlements

### Windows: Antivirus blocking installer
- **Cause:** Unsigned executable
- **Fix:** Code sign the installer

### Linux: AppImage won't run
- **Cause:** Missing FUSE
- **Fix:** `sudo apt-get install libfuse2`

### Build fails: "Cannot find module"
- **Cause:** Missing native dependencies
- **Fix:** `npm rebuild` or `npm install`

---

## CI/CD Integration

### GitHub Actions Example

Create `.github/workflows/build.yml`:

```yaml
name: Build

on:
  push:
    tags:
      - 'v*'

jobs:
  build-macos:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm install
      - run: npm run build -- --universal
        env:
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_ID_PASSWORD: ${{ secrets.APPLE_ID_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
      - uses: actions/upload-artifact@v3
        with:
          name: macos-build
          path: dist/*.dmg

  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm install
      - run: npm run build
      - uses: actions/upload-artifact@v3
        with:
          name: windows-build
          path: dist/*.exe

  build-linux:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm install
      - run: npm run build
      - uses: actions/upload-artifact@v3
        with:
          name: linux-build
          path: dist/*.{AppImage,deb,rpm}
```

---

## Additional Resources

- [electron-builder documentation](https://www.electron.build)
- [Apple Notarization Guide](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)
- [Windows Code Signing](https://docs.microsoft.com/en-us/windows/win32/seccrypto/cryptography-tools)
- [Linux AppImage Best Practices](https://docs.appimage.org/packaging-guide/index.html)

---

## Quick Reference

```bash
# Simple build (current platform)
npm run build

# Build for specific platform
npm run build -- --mac
npm run build -- --win
npm run build -- --linux

# Build universal macOS (Intel + Apple Silicon)
npm run build -- --universal

# Build for specific architecture
npm run build -- --x64
npm run build -- --arm64

# Build with publishing
npm run build -- --publish never
```
