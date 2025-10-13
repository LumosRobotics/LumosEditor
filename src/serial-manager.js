const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

class SerialManager {
    constructor() {
        this.activePort = null;
        this.parser = null;
        this.onDataCallback = null;
        this.onErrorCallback = null;
    }

    async listPorts() {
        try {
            return await SerialPort.list();
        } catch (error) {
            console.error('Error listing serial ports:', error);
            return [];
        }
    }

    async connect(portPath, baudRate = 9600) {
        try {
            if (this.activePort && this.activePort.isOpen) {
                await this.disconnect();
            }

            this.activePort = new SerialPort({
                path: portPath,
                baudRate: baudRate,
                autoOpen: false
            });

            return new Promise((resolve, reject) => {
                this.activePort.open((err) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    // Set up parser for incoming data
                    this.parser = this.activePort.pipe(new ReadlineParser({ delimiter: '\n' }));
                    
                    this.parser.on('data', (data) => {
                        if (this.onDataCallback) {
                            this.onDataCallback(data.toString().trim());
                        }
                    });

                    this.activePort.on('error', (err) => {
                        console.error('Serial port error:', err);
                        if (this.onErrorCallback) {
                            this.onErrorCallback(err);
                        }
                    });

                    resolve({ success: true, message: `Connected to ${portPath}` });
                });
            });
        } catch (error) {
            console.error('Error connecting to serial port:', error);
            return { success: false, error: error.message };
        }
    }

    async disconnect() {
        if (this.activePort && this.activePort.isOpen) {
            return new Promise((resolve) => {
                this.activePort.close((err) => {
                    if (err) {
                        console.error('Error closing port:', err);
                    }
                    this.activePort = null;
                    this.parser = null;
                    resolve();
                });
            });
        }
    }

    async write(data) {
        if (!this.activePort || !this.activePort.isOpen) {
            throw new Error('No active serial connection');
        }

        return new Promise((resolve, reject) => {
            this.activePort.write(data + '\n', (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    setDataCallback(callback) {
        this.onDataCallback = callback;
    }

    setErrorCallback(callback) {
        this.onErrorCallback = callback;
    }

    isConnected() {
        return this.activePort && this.activePort.isOpen;
    }

    getPortInfo() {
        if (this.activePort) {
            return {
                path: this.activePort.path,
                baudRate: this.activePort.baudRate
            };
        }
        return null;
    }
}

module.exports = SerialManager;