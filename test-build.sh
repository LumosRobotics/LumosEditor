#!/bin/bash

echo "=========================================="
echo "Lumos Editor - Build System Test"
echo "=========================================="
echo ""

# Check for required files
echo "1. Checking icon files..."
MISSING_ICONS=0
for icon in build/icon.icns build/icon.ico build/icon.png; do
    if [ -f "$icon" ]; then
        echo "   ✓ $icon exists"
    else
        echo "   ✗ $icon missing!"
        MISSING_ICONS=1
    fi
done

echo ""
echo "2. Checking build configuration..."
if [ -f "package.json" ]; then
    echo "   ✓ package.json exists"
    if grep -q "electron-builder" package.json; then
        echo "   ✓ electron-builder configured"
    else
        echo "   ✗ electron-builder not found in package.json"
    fi
else
    echo "   ✗ package.json missing!"
fi

echo ""
echo "3. Checking entitlements..."
if [ -f "build/entitlements.mac.plist" ]; then
    echo "   ✓ macOS entitlements file exists"
else
    echo "   ✗ entitlements.mac.plist missing"
fi

echo ""
echo "4. Checking node_modules..."
if [ -d "node_modules" ]; then
    echo "   ✓ Dependencies installed"
else
    echo "   ✗ Dependencies not installed. Run: npm install"
fi

echo ""
echo "=========================================="
if [ $MISSING_ICONS -eq 0 ]; then
    echo "✅ Build system is ready!"
    echo ""
    echo "To build for macOS:"
    echo "  npm run build"
    echo ""
    echo "To build universal binary (Intel + Apple Silicon):"
    echo "  npm run build:mac:universal"
    echo ""
    echo "Output will be in: dist/"
else
    echo "⚠️  Some files are missing. Please fix the issues above."
fi
echo "=========================================="
