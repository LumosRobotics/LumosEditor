# Lumos Editor

A modern code editor for MCU development with built-in flashing capabilities, similar to VSCode but specifically designed for embedded systems development.

## Features

- **Monaco Editor Integration**: Rich text editing with syntax highlighting for C/C++/Arduino
- **MCU Support**: Flash code to Arduino, ESP32, ESP8266 and other microcontrollers
- **Serial Communication**: Built-in serial monitor for debugging and communication
- **File Management**: Open, save, and manage project files
- **Multi-tab Interface**: Work with multiple files simultaneously
- **Real-time Output**: View compilation and upload progress
- **Cross-platform**: Built with Electron for Windows, macOS, and Linux

## Prerequisites

### For Arduino Development
- **Arduino CLI** (recommended) or Arduino IDE
  ```bash
  # Install Arduino CLI (macOS)
  brew install arduino-cli
  
  # Or download from: https://arduino.github.io/arduino-cli/
  ```

### For ESP32/ESP8266 Development
- **PlatformIO** (recommended)
  ```bash
  # Install PlatformIO
  pip install platformio
  ```

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd LumosEditor
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the application**
   ```bash
   npm start
   ```

## Development

```bash
# Run in development mode with DevTools
npm run dev

# Build the application
npm run build
```

## Usage

### Getting Started

1. **Launch Lumos Editor**
2. **Create a new file** or open an existing one
3. **Select your board type** from the dropdown (Arduino Uno, ESP32, etc.)
4. **Choose the serial port** your device is connected to
5. **Write your code** in the Monaco editor
6. **Flash to device** using Ctrl+U or the Flash button

### File Operations

- **New File**: `Ctrl+N` or File → New File
- **Open File**: `Ctrl+O` or File → Open File  
- **Save**: `Ctrl+S` or File → Save
- **Save As**: `Ctrl+Shift+S` or File → Save As

### Device Operations

- **Flash Code**: `Ctrl+U` or Device → Flash to Device
- **Serial Monitor**: `Ctrl+Shift+M` or Device → Serial Monitor
- **Refresh Ports**: Device → Refresh Ports

### Interface Overview

- **Editor Area**: Main code editing area with syntax highlighting
- **File Explorer**: Browse and manage project files (left sidebar)
- **Console Panel**: View system messages and errors
- **Serial Monitor**: Communicate with your device in real-time
- **Output Panel**: View compilation and upload progress
- **Status Bar**: Shows current file, cursor position, and connection status

## Supported Boards

### Arduino
- Arduino Uno
- Arduino Nano  
- Arduino Mega
- And other Arduino-compatible boards

### ESP32/ESP8266
- ESP32 DevKit
- ESP8266 NodeMCU
- And other ESP32/ESP8266 variants

## Configuration

### Arduino CLI Setup

If Arduino CLI is installed in a non-standard location, the application will attempt to find it automatically. For manual configuration, modify the `flasher.js` file.

### PlatformIO Setup

For ESP32/ESP8266 development, ensure PlatformIO is installed and available in your system PATH.

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| New File | `Ctrl+N` |
| Open File | `Ctrl+O` |
| Save | `Ctrl+S` |
| Save As | `Ctrl+Shift+S` |
| Flash Device | `Ctrl+U` |
| Serial Monitor | `Ctrl+Shift+M` |
| Undo | `Ctrl+Z` |
| Redo | `Shift+Ctrl+Z` |
| Cut | `Ctrl+X` |
| Copy | `Ctrl+C` |
| Paste | `Ctrl+V` |

## Architecture

The application is built using:

- **Electron**: Cross-platform desktop application framework
- **Monaco Editor**: VS Code's editor for rich text editing
- **Node.js SerialPort**: Serial communication with MCUs
- **Arduino CLI**: For Arduino board flashing
- **PlatformIO**: For ESP32/ESP8266 development

## File Structure

```
LumosEditor/
├── src/
│   ├── main.js              # Main Electron process
│   ├── preload.js           # Preload script for IPC
│   ├── index.html           # Main application UI
│   ├── serial-manager.js    # Serial communication handler
│   ├── flasher.js          # MCU flashing logic
│   ├── js/
│   │   └── app.js          # Frontend application logic
│   └── styles/
│       └── main.css        # Application styles
├── package.json
└── README.md
```

## Troubleshooting

### Common Issues

1. **"Arduino CLI not found"**
   - Install Arduino CLI or Arduino IDE
   - Ensure it's in your system PATH

2. **"Serial port access denied"**
   - On Linux: Add user to dialout group: `sudo usermod -a -G dialout $USER`
   - On macOS: No additional setup required
   - On Windows: Install proper USB drivers for your board

3. **"Flash failed"**
   - Check that the correct board type is selected
   - Verify the serial port is correct
   - Ensure the device is properly connected
   - Try pressing the reset button on some boards

### Getting Help

If you encounter issues:

1. Check the Console panel for error messages
2. Verify your board and port selections
3. Test serial connection using the Serial Monitor
4. Consult the documentation for your specific board

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Roadmap

- [ ] Project management and workspace support
- [ ] Library manager integration
- [ ] Code completion and IntelliSense
- [ ] Debugger integration
- [ ] Plugin system
- [ ] Theme customization
- [ ] Board manager UI
- [ ] More MCU platform support