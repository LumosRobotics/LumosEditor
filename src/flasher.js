const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

class MCUFlasher {
    constructor() {
        this.tempDir = path.join(os.tmpdir(), 'lumos-editor');
        this.ensureTempDir();
    }

    ensureTempDir() {
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    async compileArduino(code, boardType = 'arduino:avr:uno') {
        try {
            // Create temporary Arduino sketch
            const sketchName = `temp_sketch_${Date.now()}`;
            const sketchDir = path.join(this.tempDir, sketchName);
            const sketchFile = path.join(sketchDir, `${sketchName}.ino`);

            // Create sketch directory and file
            fs.mkdirSync(sketchDir, { recursive: true });
            fs.writeFileSync(sketchFile, code);

            // Check if Arduino CLI is available
            const arduinoCLI = await this.findArduinoCLI();
            if (!arduinoCLI) {
                throw new Error('Arduino CLI not found. Please install Arduino CLI or Arduino IDE.');
            }

            // Compile the sketch
            console.log('Compiling sketch...');
            const compileResult = await this.runCommand(arduinoCLI, [
                'compile',
                '--fqbn', this.getBoardFQBN(boardType),
                '--output-dir', sketchDir,
                sketchDir
            ]);

            // Clean up temporary files
            this.cleanupTemp(sketchDir);

            if (compileResult.success) {
                return {
                    success: true,
                    message: 'Compilation successful!',
                    output: compileResult.output
                };
            } else {
                return {
                    success: false,
                    error: 'Compilation failed',
                    output: compileResult.error
                };
            }

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async flashArduino(code, port, boardType = 'arduino:avr:uno') {
        try {
            // Create temporary Arduino sketch
            const sketchName = `temp_sketch_${Date.now()}`;
            const sketchDir = path.join(this.tempDir, sketchName);
            const sketchFile = path.join(sketchDir, `${sketchName}.ino`);

            // Create sketch directory and file
            fs.mkdirSync(sketchDir, { recursive: true });
            fs.writeFileSync(sketchFile, code);

            // Check if Arduino CLI is available
            const arduinoCLI = await this.findArduinoCLI();
            if (!arduinoCLI) {
                throw new Error('Arduino CLI not found. Please install Arduino CLI or Arduino IDE.');
            }

            // Compile the sketch
            console.log('Compiling sketch...');
            const compileResult = await this.runCommand(arduinoCLI, [
                'compile',
                '--fqbn', this.getBoardFQBN(boardType),
                '--output-dir', sketchDir,
                sketchDir
            ]);

            if (!compileResult.success) {
                throw new Error(`Compilation failed: ${compileResult.error}`);
            }

            // Upload to device
            console.log('Uploading to device...');
            const uploadResult = await this.runCommand(arduinoCLI, [
                'upload',
                '--fqbn', this.getBoardFQBN(boardType),
                '--port', port,
                '--input-dir', sketchDir
            ]);

            // Clean up temporary files
            this.cleanupTemp(sketchDir);

            if (uploadResult.success) {
                return {
                    success: true,
                    message: 'Successfully flashed to device!',
                    output: uploadResult.output
                };
            } else {
                throw new Error(`Upload failed: ${uploadResult.error}`);
            }

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async compileESP32(code) {
        try {
            // For ESP32, we'll use PlatformIO
            const esptool = await this.findESPTool();
            if (!esptool) {
                throw new Error('ESP32 tools not found. Please install PlatformIO.');
            }

            // Create temporary project structure for ESP32
            const projectName = `temp_esp32_${Date.now()}`;
            const projectDir = path.join(this.tempDir, projectName);
            const srcDir = path.join(projectDir, 'src');
            const mainFile = path.join(srcDir, 'main.cpp');

            fs.mkdirSync(srcDir, { recursive: true });
            
            // Convert Arduino code to ESP32 format if needed
            const esp32Code = this.convertToESP32(code);
            fs.writeFileSync(mainFile, esp32Code);

            // Create platformio.ini
            const platformioIni = `[env:esp32dev]
platform = espressif32
board = esp32dev
framework = arduino
monitor_speed = 115200`;
            
            fs.writeFileSync(path.join(projectDir, 'platformio.ini'), platformioIni);

            // Build using PlatformIO
            const result = await this.runCommand('pio', ['run'], { cwd: projectDir });

            this.cleanupTemp(projectDir);

            if (result.success) {
                return {
                    success: true,
                    message: 'ESP32 compilation successful!',
                    output: result.output
                };
            } else {
                return {
                    success: false,
                    error: 'ESP32 compilation failed',
                    output: result.error
                };
            }

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async flashESP32(code, port) {
        try {
            // For ESP32, we'll use PlatformIO or esptool
            const esptool = await this.findESPTool();
            if (!esptool) {
                throw new Error('ESP32 flashing tools not found. Please install PlatformIO or esptool.');
            }

            // Create temporary project structure for ESP32
            const projectName = `temp_esp32_${Date.now()}`;
            const projectDir = path.join(this.tempDir, projectName);
            const srcDir = path.join(projectDir, 'src');
            const mainFile = path.join(srcDir, 'main.cpp');

            fs.mkdirSync(srcDir, { recursive: true });
            
            // Convert Arduino code to ESP32 format if needed
            const esp32Code = this.convertToESP32(code);
            fs.writeFileSync(mainFile, esp32Code);

            // Create platformio.ini
            const platformioIni = `[env:esp32dev]
platform = espressif32
board = esp32dev
framework = arduino
monitor_speed = 115200
upload_port = ${port}`;
            
            fs.writeFileSync(path.join(projectDir, 'platformio.ini'), platformioIni);

            // Build and upload using PlatformIO
            const result = await this.runCommand('pio', ['run', '--target', 'upload'], { cwd: projectDir });

            this.cleanupTemp(projectDir);

            if (result.success) {
                return {
                    success: true,
                    message: 'Successfully flashed ESP32!',
                    output: result.output
                };
            } else {
                throw new Error(`ESP32 flash failed: ${result.error}`);
            }

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async findArduinoCLI() {
        const possiblePaths = [
            'arduino-cli',
            '/usr/local/bin/arduino-cli',
            '/usr/bin/arduino-cli',
            path.join(os.homedir(), 'bin', 'arduino-cli'),
            path.join(process.env.ARDUINO15 || '', 'arduino-cli')
        ];

        for (const cmdPath of possiblePaths) {
            try {
                const result = await this.runCommand(cmdPath, ['version'], { timeout: 5000 });
                if (result.success) {
                    return cmdPath;
                }
            } catch (error) {
                continue;
            }
        }

        return null;
    }

    async findESPTool() {
        const possibleCommands = ['pio', 'esptool.py', 'esptool'];
        
        for (const cmd of possibleCommands) {
            try {
                const result = await this.runCommand(cmd, ['--version'], { timeout: 5000 });
                if (result.success) {
                    return cmd;
                }
            } catch (error) {
                continue;
            }
        }

        return null;
    }

    getBoardFQBN(boardType) {
        const boardMap = {
            'arduino-uno': 'arduino:avr:uno',
            'arduino-nano': 'arduino:avr:nano',
            'arduino-mega': 'arduino:avr:mega',
            'esp32': 'esp32:esp32:esp32',
            'esp8266': 'esp8266:esp8266:nodemcuv2'
        };

        return boardMap[boardType] || 'arduino:avr:uno';
    }

    convertToESP32(arduinoCode) {
        // Basic conversion from Arduino to ESP32
        let esp32Code = arduinoCode;
        
        // Add necessary includes if not present
        if (!esp32Code.includes('#include <Arduino.h>')) {
            esp32Code = '#include <Arduino.h>\n' + esp32Code;
        }

        // Replace Serial with Serial if needed (ESP32 uses Serial by default)
        // Add any ESP32-specific conversions here
        
        return esp32Code;
    }

    runCommand(command, args, options = {}) {
        return new Promise((resolve) => {
            const child = spawn(command, args, {
                stdio: ['pipe', 'pipe', 'pipe'],
                ...options
            });

            let stdout = '';
            let stderr = '';

            child.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            child.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            child.on('close', (code) => {
                resolve({
                    success: code === 0,
                    output: stdout,
                    error: stderr,
                    code
                });
            });

            child.on('error', (error) => {
                resolve({
                    success: false,
                    error: error.message,
                    code: -1
                });
            });

            // Handle timeout
            if (options.timeout) {
                setTimeout(() => {
                    child.kill();
                    resolve({
                        success: false,
                        error: 'Command timed out',
                        code: -1
                    });
                }, options.timeout);
            }
        });
    }

    cleanupTemp(dir) {
        try {
            fs.rmSync(dir, { recursive: true, force: true });
        } catch (error) {
            console.warn('Failed to cleanup temp directory:', error.message);
        }
    }
}

module.exports = MCUFlasher;