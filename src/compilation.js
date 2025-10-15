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
        const compiler = (ext === '.c') ? this.gccCPath : this.gccPath;
        const outputFile = path.join(
            this.buildDir,
            path.basename(sourceFile, ext) + '.o'
        );

        const args = [
            '-c',                           // Compile only, don't link
            sourceFile,                     // Input file
            '-o', outputFile,               // Output object file
            '-I' + workspacePath,           // Include workspace root
            '-mcpu=cortex-m4',              // Target Cortex-M4
            '-mthumb',                      // Use Thumb instruction set
            '-mfloat-abi=soft',            // Soft float ABI
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

        const args = [
            ...objectFiles,
            '-o', outputPath,
            '-mcpu=cortex-m4',
            '-mthumb',
            '-mfloat-abi=soft',
            '-Wl,--gc-sections',            // Remove unused sections
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
    async compileWorkspace(workspacePath, options = {}) {
        const output = [];
        const errors = [];

        try {
            // Set build directory for this workspace
            this.setBuildDir(workspacePath);

            output.push('=== Lumos Editor - ARM Compilation ===');
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
