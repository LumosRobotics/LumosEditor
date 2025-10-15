const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

class ArmCompiler {
    constructor() {
        // Path to the bundled ARM GCC toolchain
        this.toolchainPath = path.join(__dirname, 'bin', 'gcc-arm-none-eabi-10.3-2021.10', 'bin');
        this.gccPath = path.join(this.toolchainPath, 'arm-none-eabi-g++');
        this.gccCPath = path.join(this.toolchainPath, 'arm-none-eabi-gcc');
        this.objcopyPath = path.join(this.toolchainPath, 'arm-none-eabi-objcopy');
        this.sizePath = path.join(this.toolchainPath, 'arm-none-eabi-size');

        // Build directory (will be set per workspace)
        this.buildDir = null;

        // Current board configuration
        this.boardConfig = null;
    }

    /**
     * Load board configuration from JSON file
     */
    loadBoardConfig(boardId) {
        try {
            const boardFiles = {
                'lumos-brain': 'LumosBrain.json',
                'lumos-microbrain': 'LumosMicroBrain.json'
            };

            const boardFile = boardFiles[boardId];
            if (!boardFile) {
                throw new Error(`Unknown board ID: ${boardId}`);
            }

            const boardPath = path.join(__dirname, 'boards', boardFile);
            const boardData = fs.readFileSync(boardPath, 'utf8');
            this.boardConfig = JSON.parse(boardData);

            return this.boardConfig;
        } catch (error) {
            console.error('Error loading board config:', error.message);
            return null;
        }
    }

    /**
     * Detect MCU family from board configuration
     */
    detectMcuFamily() {
        if (!this.boardConfig || !this.boardConfig.mcu) {
            return 'f4'; // Default to F4
        }

        const mcuModel = this.boardConfig.mcu.model.toUpperCase();

        if (mcuModel.includes('STM32H7')) {
            return 'h7';
        } else if (mcuModel.includes('STM32F4')) {
            return 'f4';
        } else if (mcuModel.includes('STM32G0')) {
            return 'g0';
        } else if (mcuModel.includes('STM32G4')) {
            return 'g4';
        }

        // Default to F4 for unknown families
        return 'f4';
    }

    /**
     * Get MCU-specific compilation settings
     */
    getMcuSettings() {
        const family = this.detectMcuFamily();
        const mcuModel = this.boardConfig?.mcu?.model || 'STM32F407VGT6';

        const settings = {
            f4: {
                boardPath: path.join(__dirname, 'boards', 'f4'),
                cmsisDevice: 'STM32F4xx',
                startupFile: 'startup_stm32f407xx.s',
                systemFile: 'system_stm32f4xx.c',
                linkerScript: 'STM32F407VG_FLASH.ld',
                cpuFlags: ['-mcpu=cortex-m4', '-mthumb', '-mfloat-abi=soft'],
                defines: ['STM32F407xx'],
                description: 'STM32F407VG (Cortex-M4, 168MHz)'
            },
            h7: {
                boardPath: path.join(__dirname, 'boards', 'h7'),
                cmsisDevice: 'STM32H7xx',
                startupFile: 'startup_stm32h723xx.s',
                systemFile: 'system_stm32h7xx.c',
                linkerScript: 'STM32H723VG_FLASH.ld',
                cpuFlags: ['-mcpu=cortex-m7', '-mthumb', '-mfpu=fpv5-d16', '-mfloat-abi=hard'],
                defines: ['STM32H723xx', 'CORE_CM7', 'DATA_IN_D2_SRAM'],
                description: 'STM32H723VG (Cortex-M7, 550MHz)'
            },
            g0: {
                boardPath: path.join(__dirname, 'boards', 'g0'),
                cmsisDevice: 'STM32G0xx',
                startupFile: 'startup_stm32g0b1xx.s',
                systemFile: 'system_stm32g0xx.c',
                linkerScript: 'STM32G0B1CB_FLASH.ld',
                cpuFlags: ['-mcpu=cortex-m0plus', '-mthumb'],
                defines: ['STM32G0B1xx'],
                description: 'STM32G0B1CB (Cortex-M0+, 64MHz)'
            },
            g4: {
                boardPath: path.join(__dirname, 'boards', 'g4'),
                cmsisDevice: 'STM32G4xx',
                startupFile: 'startup_stm32g431xx.s',
                systemFile: 'system_stm32g4xx.c',
                linkerScript: 'STM32G431CB_FLASH.ld',
                cpuFlags: ['-mcpu=cortex-m4', '-mthumb', '-mfpu=fpv4-sp-d16', '-mfloat-abi=hard'],
                defines: ['STM32G431xx'],
                description: 'STM32G431CB (Cortex-M4, 170MHz)'
            }
        };

        return settings[family] || settings.f4;
    }

    setBuildDir(workspacePath) {
        this.buildDir = path.join(workspacePath, '.lumos', 'build');
        if (!fs.existsSync(this.buildDir)) {
            fs.mkdirSync(this.buildDir, { recursive: true });
        }
    }

    /**
     * Find all source files in a workspace
     */
    findSourceFiles(workspacePath) {
        const sourceFiles = {
            cpp: [],
            c: [],
            headers: []
        };

        const scanDirectory = (dir) => {
            try {
                const items = fs.readdirSync(dir, { withFileTypes: true });

                for (const item of items) {
                    // Skip hidden directories and build directories
                    if (item.name.startsWith('.') || item.name === 'build' || item.name === 'node_modules') {
                        continue;
                    }

                    const itemPath = path.join(dir, item.name);

                    if (item.isDirectory()) {
                        scanDirectory(itemPath);
                    } else if (item.isFile()) {
                        const ext = path.extname(item.name).toLowerCase();

                        if (ext === '.cpp' || ext === '.ino') {
                            sourceFiles.cpp.push(itemPath);
                        } else if (ext === '.c') {
                            sourceFiles.c.push(itemPath);
                        } else if (ext === '.h' || ext === '.hpp') {
                            sourceFiles.headers.push(itemPath);
                        }
                    }
                }
            } catch (error) {
                console.error(`Error scanning directory ${dir}:`, error.message);
            }
        };

        scanDirectory(workspacePath);
        return sourceFiles;
    }

    /**
     * Compile a single source file
     */
    async compileFile(sourceFile, workspacePath, options = {}) {
        const ext = path.extname(sourceFile).toLowerCase();
        const isAssembly = (ext === '.s' || ext === '.S');

        // Use gcc (not g++) for C and assembly files
        const compiler = (isAssembly || ext === '.c') ? this.gccCPath : this.gccPath;

        const outputFile = path.join(
            this.buildDir,
            path.basename(sourceFile, ext) + '.o'
        );

        // Get MCU-specific settings
        const mcuSettings = this.getMcuSettings();
        const cmsisDeviceInclude = path.join(mcuSettings.boardPath, 'Drivers', 'CMSIS', 'Device', 'ST', mcuSettings.cmsisDevice, 'Include');
        const cmsisCoreInclude = path.join(mcuSettings.boardPath, 'Drivers', 'CMSIS', 'Include');
        const boardConfigInclude = path.join(mcuSettings.boardPath, 'lumos_config');

        // Assembly files need minimal flags
        if (isAssembly) {
            const args = [
                '-c',
                sourceFile,
                '-o', outputFile,
                ...mcuSettings.cpuFlags,
                ...(options.additionalFlags || [])
            ];
            return this.runCommand(compiler, args);
        }

        // C/C++ files get full compilation flags
        const defineFlags = mcuSettings.defines.map(def => `-D${def}`);
        const args = [
            '-c',                           // Compile only, don't link
            sourceFile,                     // Input file
            '-o', outputFile,               // Output object file
            '-I' + workspacePath,           // Include workspace root
            '-I' + boardConfigInclude,      // Board configuration
            '-I' + cmsisDeviceInclude,      // Device headers
            '-I' + cmsisCoreInclude,        // ARM CMSIS core headers
            ...mcuSettings.cpuFlags,        // CPU-specific flags
            ...defineFlags,                 // MCU defines
            '-O2',                          // Optimization level
            '-Wall',                        // Enable warnings
            '-ffunction-sections',          // Each function in its own section
            '-fdata-sections',              // Each data item in its own section
            ...(options.additionalFlags || [])
        ];

        return this.runCommand(compiler, args);
    }

    /**
     * Link object files into an executable
     */
    async linkFiles(objectFiles, outputName = 'output.elf') {
        const outputPath = path.join(this.buildDir, outputName);

        // Get MCU-specific settings
        const mcuSettings = this.getMcuSettings();
        const linkerScript = path.join(mcuSettings.boardPath, 'lumos_config', mcuSettings.linkerScript);

        const args = [
            ...objectFiles,
            '-o', outputPath,
            ...mcuSettings.cpuFlags,        // CPU-specific flags
            '-T' + linkerScript,            // Linker script for memory layout
            '-Wl,--gc-sections',            // Remove unused sections
            '-Wl,-Map=' + path.join(this.buildDir, 'output.map'),  // Generate map file
            '-specs=nosys.specs',           // Use newlib-nano
            '--specs=nano.specs'
        ];

        const result = await this.runCommand(this.gccPath, args);

        if (result.success) {
            result.outputPath = outputPath;
        }

        return result;
    }

    /**
     * Get binary size information
     */
    async getBinarySize(elfPath) {
        return this.runCommand(this.sizePath, [elfPath]);
    }

    /**
     * Convert ELF to binary format
     */
    async elfToBin(elfPath) {
        const binPath = elfPath.replace('.elf', '.bin');

        const args = [
            '-O', 'binary',
            elfPath,
            binPath
        ];

        const result = await this.runCommand(this.objcopyPath, args);

        if (result.success) {
            result.binPath = binPath;
        }

        return result;
    }

    /**
     * Check if any source file contains a main() function
     */
    hasMainFunction(sourceFiles) {
        const allFiles = [...sourceFiles.cpp, ...sourceFiles.c];

        for (const filePath of allFiles) {
            try {
                const content = fs.readFileSync(filePath, 'utf8');
                // Simple regex to detect main() function
                // Matches: int main, void main, auto main, etc.
                if (/\b(int|void|auto)\s+main\s*\(/m.test(content)) {
                    return true;
                }
            } catch (error) {
                console.error(`Error reading ${filePath}:`, error.message);
            }
        }

        return false;
    }

    /**
     * Create Arduino-style main wrapper if needed
     */
    createArduinoWrapper() {
        const wrapperPath = path.join(this.buildDir, '_lumos_main_wrapper.cpp');
        const wrapperCode = `// Auto-generated wrapper for Arduino-style setup()/loop()
extern "C" void setup() __attribute__((weak));
extern "C" void loop() __attribute__((weak));

void setup() {}
void loop() {}

int main() {
    setup();
    while(1) {
        loop();
    }
    return 0;
}
`;
        fs.writeFileSync(wrapperPath, wrapperCode);
        return wrapperPath;
    }

    /**
     * Compile an entire workspace
     */
    async compileWorkspace(workspacePath, boardId = 'lumos-brain', options = {}) {
        const output = [];
        const errors = [];

        try {
            // Load board configuration
            const boardConfig = this.loadBoardConfig(boardId);
            if (!boardConfig) {
                return {
                    success: false,
                    error: `Failed to load board configuration for: ${boardId}`,
                    output: output.join('\n')
                };
            }

            // Set build directory for this workspace
            this.setBuildDir(workspacePath);

            // Get MCU-specific settings
            const mcuSettings = this.getMcuSettings();

            output.push('=== Lumos Editor - ARM Compilation ===');
            output.push(`Board: ${boardConfig.board.name}`);
            output.push(`Target: ${mcuSettings.description}`);
            output.push(`Workspace: ${workspacePath}`);
            output.push(`Build directory: ${this.buildDir}`);
            output.push('');

            // Find all source files
            output.push('Scanning for source files...');
            const sourceFiles = this.findSourceFiles(workspacePath);

            const totalFiles = sourceFiles.cpp.length + sourceFiles.c.length;

            if (totalFiles === 0) {
                return {
                    success: false,
                    error: 'No source files found in workspace',
                    output: output.join('\n')
                };
            }

            output.push(`Found ${sourceFiles.cpp.length} C++ file(s)`);
            output.push(`Found ${sourceFiles.c.length} C file(s)`);
            output.push(`Found ${sourceFiles.headers.length} header file(s)`);
            output.push('');

            // Check if we need to create Arduino-style wrapper
            const needsWrapper = !this.hasMainFunction(sourceFiles);
            let wrapperPath = null;

            if (needsWrapper) {
                output.push('Creating Arduino-style main() wrapper...');
                wrapperPath = this.createArduinoWrapper();
            } else {
                output.push('Detected existing main() function, skipping wrapper...');
            }
            output.push('');

            // Compile each file
            output.push('Compiling source files...');
            const objectFiles = [];

            // Compile board support files first
            const boardConfigPath = path.join(mcuSettings.boardPath, 'lumos_config');
            const startupFile = path.join(boardConfigPath, mcuSettings.startupFile);
            const systemFile = path.join(boardConfigPath, mcuSettings.systemFile);

            // Compile startup code (assembly)
            output.push(`  Compiling ${boardConfig.mcu.model} startup code...`);
            const startupResult = await this.compileFile(startupFile, workspacePath, options);
            if (!startupResult.success) {
                errors.push('Failed to compile startup code:');
                errors.push(startupResult.error || startupResult.stderr);
                return {
                    success: false,
                    error: errors.join('\n'),
                    output: output.join('\n'),
                    stderr: startupResult.stderr
                };
            }
            objectFiles.push(path.join(this.buildDir, path.basename(mcuSettings.startupFile, '.s') + '.o'));

            // Compile system initialization
            output.push(`  Compiling ${boardConfig.mcu.model} system initialization...`);
            const systemResult = await this.compileFile(systemFile, workspacePath, options);
            if (!systemResult.success) {
                errors.push('Failed to compile system initialization:');
                errors.push(systemResult.error || systemResult.stderr);
                return {
                    success: false,
                    error: errors.join('\n'),
                    output: output.join('\n'),
                    stderr: systemResult.stderr
                };
            }
            objectFiles.push(path.join(this.buildDir, path.basename(mcuSettings.systemFile, '.c') + '.o'));

            output.push('');

            // Compile C++ files
            for (const cppFile of sourceFiles.cpp) {
                const fileName = path.basename(cppFile);
                output.push(`  Compiling ${fileName}...`);

                const result = await this.compileFile(cppFile, workspacePath, options);

                if (!result.success) {
                    errors.push(`Failed to compile ${fileName}:`);
                    errors.push(result.error || result.stderr);

                    return {
                        success: false,
                        error: errors.join('\n'),
                        output: output.join('\n'),
                        stderr: result.stderr
                    };
                }

                const objFile = path.join(
                    this.buildDir,
                    path.basename(cppFile, path.extname(cppFile)) + '.o'
                );
                objectFiles.push(objFile);
            }

            // Compile C files
            for (const cFile of sourceFiles.c) {
                const fileName = path.basename(cFile);
                output.push(`  Compiling ${fileName}...`);

                const result = await this.compileFile(cFile, workspacePath, options);

                if (!result.success) {
                    errors.push(`Failed to compile ${fileName}:`);
                    errors.push(result.error || result.stderr);

                    return {
                        success: false,
                        error: errors.join('\n'),
                        output: output.join('\n'),
                        stderr: result.stderr
                    };
                }

                const objFile = path.join(
                    this.buildDir,
                    path.basename(cFile, path.extname(cFile)) + '.o'
                );
                objectFiles.push(objFile);
            }

            // Compile the wrapper file if it was created
            if (wrapperPath) {
                output.push(`  Compiling Arduino wrapper...`);
                const wrapperResult = await this.compileFile(wrapperPath, workspacePath, options);

                if (!wrapperResult.success) {
                    errors.push(`Failed to compile wrapper:`);
                    errors.push(wrapperResult.error || wrapperResult.stderr);

                    return {
                        success: false,
                        error: errors.join('\n'),
                        output: output.join('\n'),
                        stderr: wrapperResult.stderr
                    };
                }

                const wrapperObjFile = path.join(
                    this.buildDir,
                    '_lumos_main_wrapper.o'
                );
                objectFiles.push(wrapperObjFile);
            }

            output.push(`Successfully compiled ${objectFiles.length} file(s)`);
            output.push('');

            // Link
            output.push('Linking...');
            const linkResult = await this.linkFiles(objectFiles, 'firmware.elf');

            if (!linkResult.success) {
                errors.push('Linking failed:');
                errors.push(linkResult.error || linkResult.stderr);

                return {
                    success: false,
                    error: errors.join('\n'),
                    output: output.join('\n'),
                    stderr: linkResult.stderr
                };
            }

            output.push('Linking successful');
            output.push('');

            // Get binary size
            output.push('Getting binary size...');
            const sizeResult = await this.getBinarySize(linkResult.outputPath);

            if (sizeResult.success && sizeResult.stdout) {
                output.push(sizeResult.stdout.trim());
            }
            output.push('');

            // Convert to binary
            output.push('Creating binary file...');
            const binResult = await this.elfToBin(linkResult.outputPath);

            if (binResult.success) {
                output.push(`Binary created: ${binResult.binPath}`);
            }

            output.push('');
            output.push('=== Compilation Complete ===');

            return {
                success: true,
                output: output.join('\n'),
                elfPath: linkResult.outputPath,
                binPath: binResult.binPath
            };

        } catch (error) {
            return {
                success: false,
                error: error.message,
                output: output.join('\n')
            };
        }
    }

    /**
     * Run a command and capture output
     */
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
                    stdout: stdout,
                    stderr: stderr,
                    error: code !== 0 ? stderr : null,
                    code: code
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

    /**
     * Clean build directory
     */
    cleanBuild() {
        try {
            if (fs.existsSync(this.buildDir)) {
                fs.rmSync(this.buildDir, { recursive: true, force: true });
                this.ensureBuildDir();
                return { success: true };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

module.exports = ArmCompiler;
