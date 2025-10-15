# Build Resources

This directory contains resources needed for building distributable packages.

## Example Icons Included

This directory now contains **example icons** with a circuit board/LED design:
- ✅ `icon.icns` - macOS icon (ready to use)
- ✅ `icon.ico` - Windows icon (ready to use)
- ✅ `icon.png` - Linux icon (ready to use)

These are functional placeholder icons. You can use them as-is for testing, or replace them with your own custom icons.

## Icon Design

The included icons feature:
- Dark circuit board background
- Glowing yellow LED in the center (representing "Lumos" - light)
- Blue circuit traces connecting to the corners
- Solder pads at connection points

This design fits the embedded systems/electronics theme of Lumos Editor.

---

## Replacing with Custom Icons

To use your own icons, you need icons in the following formats:

### macOS
- **icon.icns** - macOS app icon bundle
  - Required sizes: 16x16, 32x32, 64x64, 128x128, 256x256, 512x512, 1024x1024
  - Tool to create: `iconutil` (built into macOS)

  ```bash
  # Create icns from png files
  mkdir icon.iconset
  # Add various sized PNGs to icon.iconset/
  # icon_16x16.png, icon_32x32.png, etc.
  iconutil -c icns icon.iconset -o build/icon.icns
  ```

### Windows
- **icon.ico** - Windows icon file
  - Required sizes: 16x16, 32x32, 48x48, 64x64, 128x128, 256x256
  - Tool to create: Online converters or Photoshop

### Linux
- **icon.png** - Linux icon (PNG format)
  - Recommended size: 512x512 or 1024x1024
  - Format: PNG with transparency

## Quick Icon Setup

If you don't have icons ready, you can:

1. **Use a placeholder temporarily:**
   ```bash
   # macOS - use existing app icon as template
   cp /System/Applications/TextEdit.app/Contents/Resources/AppIcon.icns build/icon.icns
   ```

2. **Create proper icons from a single source:**
   - Create a 1024x1024 PNG with your logo
   - Use online tools like:
     - https://cloudconvert.com/png-to-icns (macOS)
     - https://cloudconvert.com/png-to-ico (Windows)
   - Or use Electron's icon tools:
     ```bash
     npm install --save-dev electron-icon-builder
     npx electron-icon-builder --input=source.png --output=build
     ```

## Files in This Directory

- `entitlements.mac.plist` - macOS security entitlements (USB, serial port access)
- `icon.icns` - macOS icon (add this)
- `icon.ico` - Windows icon (add this)
- `icon.png` - Linux icon (add this)

## Building Without Icons

If you try to build without icons, electron-builder will use default icons, but they won't look professional. Add proper icons before distributing your app.
