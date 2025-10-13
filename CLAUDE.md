# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Lumos Editor is an Electron-based code editor for MCU (microcontroller) development with built-in flashing capabilities. It targets Arduino, ESP32, and ESP8266 platforms, providing a Monaco Editor-based interface with integrated serial communication and device programming features.

## Development Commands

### Running the Application
```bash
npm start              # Run in production mode
npm run dev            # Run in development mode with DevTools
```

### Building
```bash
npm run build          # Build distributable using electron-builder
```

### Testing
```bash
npm test               # Run Jest tests (if configured)
```

## Architecture

### Electron Process Architecture

**Main Process** (`src/main.js`):
- Electron app lifecycle management
- IPC (Inter-Process Communication) handlers for file operations, compilation, flashing, and serial communication
- File system operations with workspace management using chokidar for file watching
- Menu system with keyboard shortcuts (Cmd/Ctrl+N, Cmd/Ctrl+O, Cmd/Ctrl+S, Cmd/Ctrl+U, etc.)
- Security model: contextIsolation enabled, nodeIntegration disabled

**Preload Script** (`src/preload.js`):
- Context bridge exposing safe APIs to renderer via `window.electronAPI`
- All main process communication goes through this bridge

**Renderer Process** (`src/js/app.js`):
- `LumosEditor` class manages entire frontend application
- Monaco Editor integration with custom Arduino syntax highlighting
- Tab-based multi-file editing with separate Monaco models per tab
- Workspace and file tree rendering with real-time updates

### Key Components

**SerialManager** (`src/serial-manager.js`):
- Manages serial port connections using the `serialport` library
- Handles reading/writing to connected MCUs
- Readline parser for processing incoming serial data
- Callback-based architecture for data and error handling

**MCUFlasher** (`src/flasher.js`):
- Handles compilation and flashing for different MCU platforms
- Arduino: Uses Arduino CLI (`arduino-cli`)
- ESP32/ESP8266: Uses PlatformIO (`pio`)
- Auto-detection of toolchain locations across different platforms
- Temporary sketch/project creation for compilation
- Board FQBN mapping (e.g., `arduino:avr:uno`, `esp32:esp32:esp32`)

**ARM GCC Integration**:
- Bundled ARM GCC toolchain in `src/bin/gcc-arm-none-eabi-10.3-2021.10/`
- Compilation handler in main.js (`compile-with-arm-gcc` IPC handler)
- Currently integrated but basic implementation - future enhancement target

### Workspace System

**Project Structure**:
- `.lumos_ws` file marks initialized Lumos projects (JSON metadata)
- Default structure: `src/` (source files), `build/` (build artifacts)
- File watcher automatically updates UI when files/folders change
- Security: All file operations validated against workspace boundaries

**File Operations**:
- Multi-tab editing with unsaved change tracking (dot indicator)
- Language auto-detection based on file extension (.ino → Arduino, .cpp → C++, etc.)
- Special handling for `.lumos_ws` files (rendered as JSON)
- Context menu for creating files/folders within workspace

### Monaco Editor Configuration

- Custom Arduino language definition with syntax highlighting
- Keywords: Arduino functions (pinMode, digitalWrite, Serial, etc.)
- Constants: HIGH, LOW, INPUT, OUTPUT, INPUT_PULLUP
- Support for C/C++/Python/JavaScript via Monaco's built-in language support
- Font size controls: Cmd/Ctrl+Plus (increase), Cmd/Ctrl+Minus (decrease), Cmd/Ctrl+0 (reset)

## Common Development Patterns

### IPC Communication Pattern
All renderer-to-main communication uses the invoke/handle pattern:
```javascript
// Main process (main.js)
ipcMain.handle('operation-name', async (event, args) => { ... });

// Preload (preload.js)
contextBridge.exposeInMainWorld('electronAPI', {
  operationName: (args) => ipcRenderer.invoke('operation-name', args)
});

// Renderer (app.js)
const result = await window.electronAPI.operationName(args);
```

### Adding New Board Support
1. Add board type to `getBoardFQBN()` in `flasher.js`
2. Update board-select dropdown in `index.html`
3. Consider platform-specific compilation logic (Arduino CLI vs PlatformIO)

### File Tree Updates
The file watcher in main.js automatically sends events to renderer:
- `workspace-opened`: Initial workspace load
- `file-added`, `file-removed`: File changes
- `directory-added`, `directory-removed`: Directory changes

Renderer automatically refreshes UI - no manual intervention needed.

### Tab Management
Each tab maintains its own Monaco model to preserve undo/redo history:
- Create: `monaco.editor.createModel()`
- Switch: `editor.setModel(tab.model)`
- Close: `tab.model.dispose()` (important for memory management)

## Prerequisites

### For Arduino Development
- Arduino CLI must be installed and in PATH
- Install via: `brew install arduino-cli` (macOS) or download from arduino.github.io

### For ESP32/ESP8266 Development
- PlatformIO required
- Install via: `pip install platformio`

## Important Implementation Details

- **Security**: All file operations validate paths are within current workspace to prevent directory traversal
- **Memory Management**: Dispose Monaco models when closing tabs to prevent memory leaks
- **Temporary Files**: MCUFlasher creates temp sketches in OS tmpdir, cleanup is automatic
- **Serial Port Access**: Requires proper permissions (dialout group on Linux, proper drivers on Windows)
- **Font Size State**: Stored in `currentFontSize` property, not persisted between sessions
- **ARM GCC**: Bundled toolchain is integrated but compilation logic is minimal - expand for production use

## Board Type Mappings

| UI Board Type | FQBN |
|--------------|------|
| arduino-uno | arduino:avr:uno |
| arduino-nano | arduino:avr:nano |
| arduino-mega | arduino:avr:mega |
| esp32 | esp32:esp32:esp32 |
| esp8266 | esp8266:esp8266:nodemcuv2 |

## Known Limitations

- Serial monitor auto-scroll only, no search/filter
- Single workspace at a time (no workspace switching without restart)
- No IntelliSense/code completion (future roadmap item)
- ARM GCC integration is basic (only verification test implemented)
- No project templates beyond default Arduino sketch
