class LumosEditor {
    constructor() {
        this.editor = null;
        this.currentFile = null;
        this.openTabs = new Map();
        this.activeTab = null;
        this.serialPorts = [];
        this.serialConnected = false;
        this.currentWorkspace = null;
        this.expandedDirectories = new Set();
        this.contextMenuTarget = null;
        this.contextMenuTargetType = null; // 'file' or 'directory'
        this.currentFontSize = 14;
        this.iconBasePath = '../third_party/seti-ui/icons/';
        this.currentTheme = 'dark'; // 'dark' or 'light'

        this.init();
    }

    getFileIcon(fileName, extension) {
        const iconMap = {
            '.ino': 'c.svg',           // Arduino files use C icon
            '.cpp': 'cpp.svg',
            '.c': 'c.svg',
            '.h': 'c.svg',
            '.hpp': 'cpp.svg',
            '.json': 'json.svg',
            '.js': 'javascript.svg',
            '.py': 'python.svg',
            '.md': 'markdown.svg',
            '.txt': 'default.svg',
            '.xml': 'xml.svg',
            '.html': 'html.svg',
            '.py': 'python.svg',
            '.rs': 'rust.svg',
        };

        // Special case for .lumos_ws file
        if (fileName === '.lumos_ws') {
            return this.iconBasePath + 'json.svg';
        }

        const icon = iconMap[extension] || 'default.svg';
        return this.iconBasePath + icon;
    }

    getFolderIcon(isExpanded) {
        // Seti UI uses the same folder icon for both states
        return this.iconBasePath + 'folder.svg';
    }

    async init() {
        this.loadTheme();
        this.initMonaco();
        this.setupEventListeners();
        this.setupMenuListeners();
        this.setupWorkspaceListeners();
        await this.refreshSerialPorts();
        this.setupPanelSwitching();
        this.setupContextMenu();
        this.setupSidebarResize();
        this.setupBottomPanelResize();
        await this.loadWorkspace();
        this.loadRecentDirectories();
    }

    // Recent directories management
    loadRecentDirectories() {
        const stored = localStorage.getItem('lumosRecentDirectories');
        const recentDirs = stored ? JSON.parse(stored) : [];
        this.displayRecentDirectories(recentDirs);
    }

    saveRecentDirectory(dirPath, dirName) {
        const stored = localStorage.getItem('lumosRecentDirectories');
        let recentDirs = stored ? JSON.parse(stored) : [];

        // Remove if already exists (to move to top)
        recentDirs = recentDirs.filter(item => item.path !== dirPath);

        // Add to beginning
        recentDirs.unshift({
            path: dirPath,
            name: dirName,
            lastOpened: new Date().toISOString()
        });

        // Keep only last 10
        recentDirs = recentDirs.slice(0, 10);

        localStorage.setItem('lumosRecentDirectories', JSON.stringify(recentDirs));
        this.displayRecentDirectories(recentDirs);
    }

    removeRecentDirectory(dirPath) {
        const stored = localStorage.getItem('lumosRecentDirectories');
        let recentDirs = stored ? JSON.parse(stored) : [];

        recentDirs = recentDirs.filter(item => item.path !== dirPath);

        localStorage.setItem('lumosRecentDirectories', JSON.stringify(recentDirs));
        this.displayRecentDirectories(recentDirs);
    }

    displayRecentDirectories(recentDirs) {
        const recentList = document.getElementById('recent-list');
        const recentContainer = document.getElementById('recent-directories');

        if (recentDirs.length === 0) {
            recentContainer.classList.add('hidden');
            return;
        }

        recentContainer.classList.remove('hidden');
        recentList.innerHTML = '';

        recentDirs.forEach(dir => {
            const item = document.createElement('div');
            item.className = 'recent-item';

            const info = document.createElement('div');
            info.className = 'recent-item-info';

            const name = document.createElement('div');
            name.className = 'recent-item-name';
            name.textContent = dir.name;

            const path = document.createElement('div');
            path.className = 'recent-item-path';
            path.textContent = dir.path;

            info.appendChild(name);
            info.appendChild(path);

            const removeBtn = document.createElement('button');
            removeBtn.className = 'recent-item-remove';
            removeBtn.textContent = '×';
            removeBtn.title = 'Remove from recent';

            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.removeRecentDirectory(dir.path);
            });

            item.appendChild(info);
            item.appendChild(removeBtn);

            item.addEventListener('click', () => {
                this.openRecentDirectory(dir.path);
            });

            recentList.appendChild(item);
        });
    }

    async openRecentDirectory(dirPath) {
        // Use the main process to open the folder
        await this.setWorkspaceFromPath(dirPath);
    }

    async setWorkspaceFromPath(dirPath) {
        try {
            const result = await window.electronAPI.openFolderPath(dirPath);
            if (!result.success) {
                this.addToConsole(`Error opening folder: ${result.error}`);
            }
            // The workspace-opened event will be triggered by the main process
        } catch (error) {
            this.addToConsole(`Error opening folder: ${error.message}`);
        }
    }

    initMonaco() {
        require.config({ paths: { vs: '../node_modules/monaco-editor/min/vs' } });

        require(['vs/editor/editor.main'], () => {
            // Configure Monaco for better C/C++/Arduino support
            monaco.languages.register({ id: 'arduino' });
            monaco.languages.setMonarchTokensProvider('arduino', {
                tokenizer: {
                    root: [
                        [/#include\s*<[^>]*>/, 'keyword.preprocessor'],
                        [/#define\s+\w+/, 'keyword.preprocessor'],
                        [/\b(void|int|float|double|char|bool|String|byte)\b/, 'keyword.type'],
                        [/\b(setup|loop|pinMode|digitalWrite|digitalRead|analogRead|analogWrite|Serial|delay)\b/, 'keyword.arduino'],
                        [/\b(if|else|for|while|do|switch|case|break|continue|return)\b/, 'keyword.control'],
                        [/\b(HIGH|LOW|INPUT|OUTPUT|INPUT_PULLUP)\b/, 'keyword.constant'],
                        [/\b\d+\b/, 'number'],
                        [/"([^"\\]|\\.)*$/, 'string.invalid'],
                        [/"/, 'string', '@string'],
                        [/\/\*/, 'comment', '@comment'],
                        [/\/\/.*$/, 'comment'],
                    ],
                    string: [
                        [/[^\\"]+/, 'string'],
                        [/\\./, 'string.escape.invalid'],
                        [/"/, 'string', '@pop']
                    ],
                    comment: [
                        [/[^\/*]+/, 'comment'],
                        [/\*\//, 'comment', '@pop'],
                        [/[\/*]/, 'comment']
                    ]
                }
            });

            const monacoTheme = this.currentTheme === 'dark' ? 'vs-dark' : 'vs';
            this.editor = monaco.editor.create(document.getElementById('editor'), {
                value: '',
                language: 'plaintext',
                theme: monacoTheme,
                automaticLayout: true,
                minimap: { enabled: false },
                fontSize: 14,
                lineNumbers: 'off',
                renderLineHighlight: 'none',
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                readOnly: true
            });

            // Update status bar on cursor position change
            this.editor.onDidChangeCursorPosition((e) => {
                const position = e.position;
                document.getElementById('status-line-col').textContent =
                    `Ln ${position.lineNumber}, Col ${position.column}`;
            });

            // Content change tracking will be set up per model
            // when tabs are created
        });
    }

    setupEventListeners() {
        // File menu dropdown
        document.getElementById('file-menu-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.hideEditMenu();
            this.toggleFileMenu();
        });

        document.getElementById('toolbar-open-folder').addEventListener('click', () => {
            this.hideFileMenu();
            this.openFolderDialog();
        });

        // Edit menu dropdown
        document.getElementById('edit-menu-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.hideFileMenu();
            this.toggleEditMenu();
        });

        // Theme submenu
        document.getElementById('theme-menu-item').addEventListener('mouseenter', () => {
            this.showThemeSubmenu();
        });

        document.getElementById('theme-menu-item').addEventListener('mouseleave', (e) => {
            // Only hide if not moving to submenu
            const submenu = document.getElementById('theme-submenu');
            const rect = submenu.getBoundingClientRect();
            if (e.clientX < rect.left || e.clientX > rect.right ||
                e.clientY < rect.top || e.clientY > rect.bottom) {
                setTimeout(() => this.hideThemeSubmenu(), 100);
            }
        });

        document.getElementById('theme-submenu').addEventListener('mouseenter', () => {
            this.showThemeSubmenu();
        });

        document.getElementById('theme-submenu').addEventListener('mouseleave', () => {
            this.hideThemeSubmenu();
        });

        // Theme selection
        document.getElementById('theme-dark').addEventListener('click', () => {
            this.setTheme('dark');
            this.hideEditMenu();
        });

        document.getElementById('theme-light').addEventListener('click', () => {
            this.setTheme('light');
            this.hideEditMenu();
        });

        // Close dropdowns when clicking outside
        document.addEventListener('click', () => {
            this.hideFileMenu();
            this.hideEditMenu();
        });

        // Prevent dropdowns from closing when clicking inside them
        document.getElementById('file-dropdown').addEventListener('click', (e) => {
            e.stopPropagation();
        });

        document.getElementById('edit-dropdown').addEventListener('click', (e) => {
            e.stopPropagation();
        });

        // Toolbar buttons
        document.getElementById('init-project-btn').addEventListener('click', () => {
            this.initializeProject();
        });

        document.getElementById('compile-btn').addEventListener('click', () => {
            this.compileCode();
        });

        document.getElementById('flash-btn').addEventListener('click', () => {
            this.flashToDevice();
        });

        // Serial monitor
        document.getElementById('serial-send').addEventListener('click', () => {
            this.sendSerialData();
        });

        document.getElementById('serial-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendSerialData();
            }
        });

        // Port selection
        document.getElementById('port-select').addEventListener('change', async (e) => {
            const port = e.target.value;
            if (port) {
                await this.connectToSerial(port);
            } else {
                await this.disconnectSerial();
            }
        });

        // Open folder buttons
        document.getElementById('open-folder-btn-center').addEventListener('click', () => {
            this.openFolderDialog();
        });

        document.getElementById('open-folder-btn-welcome').addEventListener('click', () => {
            this.openFolderDialog();
        });

        // Font size keyboard shortcuts
        document.addEventListener('keydown', (e) => {

            if ((e.metaKey || e.ctrlKey) && (e.key === '=' || e.key === '+' || (e.shiftKey && e.key === '='))) {
                e.preventDefault();
                this.increaseFontSize();
            } else if ((e.metaKey || e.ctrlKey) && e.key === '-') {
                e.preventDefault();
                this.decreaseFontSize();
            } else if ((e.metaKey || e.ctrlKey) && e.key === '0') {
                e.preventDefault();
                this.resetFontSize();
            }
        });
    }

    setupMenuListeners() {
        // Listen for menu events from main process
        window.electronAPI.onMenuNewFile(() => this.newFile());
        window.electronAPI.onMenuSave(() => this.saveCurrentFile());
        window.electronAPI.onMenuFlash(() => this.flashToDevice());
        window.electronAPI.onMenuSerialMonitor(() => this.showPanel('serial'));

        window.electronAPI.onFileOpened((event, { path, content }) => {
            this.openFile(path, content);
        });

        window.electronAPI.onSaveFileAs((event, filePath) => {
            this.saveFileAs(filePath);
        });

        window.electronAPI.onSerialPortsUpdated((event, ports) => {
            this.serialPorts = ports;
            this.updatePortSelect();
        });

        window.electronAPI.onSerialDataReceived((event, data) => {
            this.addToSerial(data);
        });

        window.electronAPI.onSerialError((event, error) => {
            this.addToSerial(`Error: ${error}`);
            this.serialConnected = false;
            this.updateConnectionStatus('');
        });
    }

    setupWorkspaceListeners() {
        window.electronAPI.onWorkspaceOpened((event, workspace) => {
            this.currentWorkspace = workspace;
            this.saveRecentDirectory(workspace.path, workspace.name);
            this.updateWorkspaceUI();
            this.renderFileTree();
            this.updateInitProjectButton();
        });

        window.electronAPI.onFileAdded((event, file) => {
            this.refreshFileTreeFromBackend(); // Refresh file tree from backend
            this.updateInitProjectButton(); // Check if .lumos_ws was added
        });

        window.electronAPI.onFileChanged((event, file) => {
            // Check if this file is currently open in a tab
            const openTab = Array.from(this.openTabs.entries())
                .find(([id, tab]) => tab.filePath === file.path);

            if (openTab) {
                const [tabId, tab] = openTab;
                this.handleExternalFileChange(tabId, tab, file.path);
            }
        });

        window.electronAPI.onFileRemoved((event, file) => {
            this.refreshFileTreeFromBackend(); // Refresh file tree from backend
            this.updateInitProjectButton(); // Check if .lumos_ws was removed

            // Close tab if the removed file was open
            const tabToClose = Array.from(this.openTabs.entries())
                .find(([id, tab]) => tab.filePath === file.path);
            if (tabToClose) {
                this.closeTab(tabToClose[0]);
            }
        });

        window.electronAPI.onDirectoryAdded((event, dir) => {
            this.refreshFileTreeFromBackend(); // Refresh file tree from backend
        });

        window.electronAPI.onDirectoryRemoved((event, dir) => {
            this.refreshFileTreeFromBackend(); // Refresh file tree from backend
        });
    }

    setupPanelSwitching() {
        const panelTabs = document.querySelectorAll('.panel-tab');
        panelTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const panelName = tab.dataset.panel;
                this.showPanel(panelName);
            });
        });
    }

    setupSidebarResize() {
        const resizeHandle = document.getElementById('sidebar-resize-handle');
        const sidebar = document.getElementById('sidebar');
        let isResizing = false;
        let startX = 0;
        let startWidth = 0;

        // Load saved width from localStorage
        const savedWidth = localStorage.getItem('lumosSidebarWidth');
        if (savedWidth) {
            sidebar.style.width = savedWidth + 'px';
        }

        resizeHandle.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.clientX;
            startWidth = sidebar.offsetWidth;
            resizeHandle.classList.add('resizing');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;

            const delta = e.clientX - startX;
            const newWidth = startWidth + delta;

            // Respect min and max width
            const minWidth = 150;
            const maxWidth = 600;
            const clampedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));

            sidebar.style.width = clampedWidth + 'px';
        });

        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                resizeHandle.classList.remove('resizing');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';

                // Save width to localStorage
                localStorage.setItem('lumosSidebarWidth', sidebar.offsetWidth);
            }
        });
    }

    setupBottomPanelResize() {
        const resizeHandle = document.getElementById('bottom-panel-resize-handle');
        const bottomPanel = document.getElementById('bottom-panel');
        let isResizing = false;
        let startY = 0;
        let startHeight = 0;

        // Load saved height from localStorage
        const savedHeight = localStorage.getItem('lumosBottomPanelHeight');
        if (savedHeight) {
            bottomPanel.style.height = savedHeight + 'px';
        }

        resizeHandle.addEventListener('mousedown', (e) => {
            isResizing = true;
            startY = e.clientY;
            startHeight = bottomPanel.offsetHeight;
            resizeHandle.classList.add('resizing');
            document.body.style.cursor = 'row-resize';
            document.body.style.userSelect = 'none';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;

            const delta = startY - e.clientY;
            const newHeight = startHeight + delta;

            // Respect min and max height
            const minHeight = 100;
            const maxHeight = 600;
            const clampedHeight = Math.max(minHeight, Math.min(maxHeight, newHeight));

            bottomPanel.style.height = clampedHeight + 'px';
        });

        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                resizeHandle.classList.remove('resizing');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';

                // Save height to localStorage
                localStorage.setItem('lumosBottomPanelHeight', bottomPanel.offsetHeight);
            }
        });
    }

    setupContextMenu() {
        const contextMenu = document.getElementById('context-menu');

        // Handle right-click on file explorer
        document.getElementById('file-explorer').addEventListener('contextmenu', (e) => {
            e.preventDefault();

            // Find the target directory (either the clicked directory or the workspace root)
            let targetPath = this.currentWorkspace ? this.currentWorkspace.path : null;

            // Check if right-clicked on a file or directory item
            const fileItem = e.target.closest('.file-item');
            if (fileItem) {
                const itemPath = fileItem.dataset.path;
                const itemType = fileItem.dataset.type;

                // Store the type of the clicked item
                this.contextMenuTargetType = itemType;

                // Store the full path of the clicked item (for deletion)
                this.contextMenuTargetItemPath = itemPath;

                // If it's a directory, use it as target. If it's a file, use its parent directory
                if (itemType === 'directory') {
                    targetPath = itemPath;
                } else {
                    // Use parent directory for files (for creating new files/folders)
                    targetPath = itemPath.substring(0, itemPath.lastIndexOf('/'));
                }
            }

            if (targetPath) {
                this.contextMenuTarget = targetPath;
                this.showContextMenu(e.clientX, e.clientY);
            }
        });

        // Handle context menu clicks
        document.getElementById('context-new-file').addEventListener('click', () => {
            this.hideContextMenu();
            this.showNewFileDialog();
        });

        document.getElementById('context-new-folder').addEventListener('click', () => {
            this.hideContextMenu();
            this.showNewFolderDialog();
        });

        document.getElementById('context-delete-file').addEventListener('click', () => {
            this.hideContextMenu();
            this.deleteFile();
        });

        // Hide context menu when clicking elsewhere
        document.addEventListener('click', () => {
            this.hideContextMenu();
        });

        // Prevent context menu from triggering click
        contextMenu.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }

    showContextMenu(x, y) {
        const contextMenu = document.getElementById('context-menu');
        const deleteOption = document.getElementById('context-delete-file');
        const deleteText = document.getElementById('context-delete-text');
        const deleteSeparator = document.getElementById('context-delete-separator');

        // Show delete option for both files and folders, update text accordingly
        if (this.contextMenuTargetType === 'file' || this.contextMenuTargetType === 'directory') {
            deleteOption.classList.remove('hidden');
            deleteSeparator.classList.remove('hidden');

            // Update the text based on type
            if (this.contextMenuTargetType === 'file') {
                deleteText.textContent = 'Delete File';
            } else {
                deleteText.textContent = 'Delete Folder';
            }
        } else {
            deleteOption.classList.add('hidden');
            deleteSeparator.classList.add('hidden');
        }

        contextMenu.style.left = `${x}px`;
        contextMenu.style.top = `${y}px`;
        contextMenu.classList.remove('hidden');

        // Adjust position if menu goes off screen
        const rect = contextMenu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            contextMenu.style.left = `${x - rect.width}px`;
        }
        if (rect.bottom > window.innerHeight) {
            contextMenu.style.top = `${y - rect.height}px`;
        }
    }

    hideContextMenu() {
        document.getElementById('context-menu').classList.add('hidden');
    }

    toggleFileMenu() {
        const dropdown = document.getElementById('file-dropdown');
        dropdown.classList.toggle('hidden');
    }

    hideFileMenu() {
        const dropdown = document.getElementById('file-dropdown');
        dropdown.classList.add('hidden');
    }

    toggleEditMenu() {
        const dropdown = document.getElementById('edit-dropdown');
        dropdown.classList.toggle('hidden');
    }

    hideEditMenu() {
        const dropdown = document.getElementById('edit-dropdown');
        const submenu = document.getElementById('theme-submenu');
        dropdown.classList.add('hidden');
        submenu.classList.add('hidden');
    }

    showThemeSubmenu() {
        const submenu = document.getElementById('theme-submenu');
        submenu.classList.remove('hidden');
    }

    hideThemeSubmenu() {
        const submenu = document.getElementById('theme-submenu');
        submenu.classList.add('hidden');
    }

    loadTheme() {
        // Load saved theme from localStorage, default to dark
        const savedTheme = localStorage.getItem('lumosTheme') || 'dark';
        this.currentTheme = savedTheme;
        this.applyTheme(savedTheme);
    }

    setTheme(theme) {
        this.currentTheme = theme;

        // Save theme preference
        localStorage.setItem('lumosTheme', theme);

        // Apply the theme
        this.applyTheme(theme);
    }

    applyTheme(theme) {
        // Update theme indicators
        const darkIndicator = document.querySelector('#theme-dark .theme-indicator');
        const lightIndicator = document.querySelector('#theme-light .theme-indicator');

        if (theme === 'dark') {
            darkIndicator.textContent = '●';
            lightIndicator.textContent = '';
            document.body.classList.remove('light-theme');
        } else {
            darkIndicator.textContent = '';
            lightIndicator.textContent = '●';
            document.body.classList.add('light-theme');
        }

        // Update Monaco editor theme if editor is initialized
        if (this.editor) {
            const monacoTheme = theme === 'dark' ? 'vs-dark' : 'vs';
            monaco.editor.setTheme(monacoTheme);
        }
    }

    showNewFileDialog() {
        this.showInlineInput('file');
    }

    showNewFolderDialog() {
        this.showInlineInput('folder');
    }

    showInlineInput(type) {
        if (!this.contextMenuTarget) {
            return;
        }

        // Remove any existing inline input
        const existingInput = document.querySelector('.inline-input-container');
        if (existingInput) {
            existingInput.remove();
        }

        // Create inline input container
        const inputContainer = document.createElement('div');
        inputContainer.className = 'inline-input-container';

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'inline-input';
        input.placeholder = type === 'file' ? 'filename.ext' : 'folder name';
        input.value = '';

        inputContainer.appendChild(input);

        // Find the target directory's children container
        // First, ensure the directory is expanded
        if (!this.expandedDirectories.has(this.contextMenuTarget)) {
            this.expandedDirectories.add(this.contextMenuTarget);
            this.renderFileTree();
        }

        // Find the directory element with the matching path
        const dirElements = document.querySelectorAll('.file-item.directory');
        let targetChildrenContainer = null;

        for (const dirElement of dirElements) {
            if (dirElement.dataset.path === this.contextMenuTarget) {
                // Find the next sibling which should be the .file-children container
                const nextSibling = dirElement.nextElementSibling;
                if (nextSibling && nextSibling.classList.contains('file-children')) {
                    targetChildrenContainer = nextSibling;
                    break;
                }
            }
        }

        // If we found the children container, insert at the beginning
        // Otherwise, fall back to the file tree root (for workspace root)
        if (targetChildrenContainer) {
            targetChildrenContainer.insertBefore(inputContainer, targetChildrenContainer.firstChild);
        } else {
            // This happens when right-clicking in empty space (workspace root)
            const fileTree = document.getElementById('file-tree');
            if (fileTree) {
                fileTree.insertBefore(inputContainer, fileTree.firstChild);
            }
        }

        // Focus the input
        input.focus();

        // Handle keyboard events
        input.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const name = input.value.trim();
                if (name) {
                    if (type === 'file') {
                        await this.createNewFileAndOpen(name);
                    } else {
                        await this.createNewFolder(name);
                    }
                }
                inputContainer.remove();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                inputContainer.remove();
            }
        });

        // Handle blur (clicking outside)
        input.addEventListener('blur', () => {
            setTimeout(() => inputContainer.remove(), 100);
        });
    }

    async createNewFile(fileName) {
        if (!this.contextMenuTarget) {
            return;
        }

        try {
            const result = await window.electronAPI.createFile(this.contextMenuTarget, fileName);
            if (!result.success) {
                this.addToConsole(`Error creating file: ${result.error}`);
            }
            // File watcher will automatically refresh the tree
        } catch (error) {
            this.addToConsole(`Error creating file: ${error.message}`);
        }
    }

    async createNewFileAndOpen(fileName) {
        if (!this.contextMenuTarget) {
            return;
        }

        try {
            // Create the file
            const result = await window.electronAPI.createFile(this.contextMenuTarget, fileName);
            if (!result.success) {
                this.addToConsole(`Error creating file: ${result.error}`);
                return;
            }

            // Construct the full file path
            const filePath = `${this.contextMenuTarget}/${fileName}`;

            // Read the file content
            const readResult = await window.electronAPI.readWorkspaceFile(filePath);
            if (readResult.success) {
                // Open the file in a new tab
                this.openFile(filePath, readResult.content);
            } else {
                this.addToConsole(`Error opening file: ${readResult.error}`);
            }
        } catch (error) {
            this.addToConsole(`Error creating file: ${error.message}`);
        }
    }

    async createNewFolder(folderName) {
        if (!this.contextMenuTarget) {
            return;
        }

        try {
            const result = await window.electronAPI.createFolder(this.contextMenuTarget, folderName);
            if (!result.success) {
                this.addToConsole(`Error creating folder: ${result.error}`);
            }
            // File watcher will automatically refresh the tree
        } catch (error) {
            this.addToConsole(`Error creating folder: ${error.message}`);
        }
    }

    async deleteFile() {
        if (!this.contextMenuTargetItemPath || !this.contextMenuTargetType) {
            return;
        }

        // Get the item name from the path
        const itemName = this.contextMenuTargetItemPath.split('/').pop();
        const itemType = this.contextMenuTargetType === 'file' ? 'file' : 'folder';

        // Show confirmation dialog
        const confirmed = confirm(`Are you sure you want to delete ${itemType} "${itemName}"?\n\nThis action cannot be undone.`);

        if (!confirmed) {
            return;
        }

        try {
            const result = await window.electronAPI.deleteFile(this.contextMenuTargetItemPath);
            if (!result.success) {
                this.addToConsole(`Error deleting ${itemType}: ${result.error}`);
            }
            // File watcher will automatically refresh the tree
        } catch (error) {
            this.addToConsole(`Error deleting ${itemType}: ${error.message}`);
        }
    }

    async refreshFileTree() {
        if (this.currentWorkspace) {
            try {
                const workspace = await window.electronAPI.getWorkspaceInfo();
                if (workspace) {
                    this.currentWorkspace = workspace;
                    this.renderFileTree();
                }
            } catch (error) {
                this.addToConsole(`Error refreshing file tree: ${error.message}`);
            }
        }
    }

    async refreshFileTreeFromBackend() {
        // This function refreshes the file tree by fetching latest data from backend
        if (this.currentWorkspace) {
            try {
                const workspace = await window.electronAPI.getWorkspaceInfo();
                if (workspace) {
                    this.currentWorkspace = workspace;
                    this.renderFileTree();
                    this.updateInitProjectButton();
                }
            } catch (error) {
                console.error('Error refreshing file tree from backend:', error);
            }
        }
    }

    newFile() {
        const fileName = `Untitled-${Date.now()}.ino`;
        const tabId = this.createTab(fileName, null);
        const tab = this.openTabs.get(tabId);

        // Set default Arduino content in the tab's model
        tab.model.setValue('void setup() {\n  \n}\n\nvoid loop() {\n  \n}');

        this.switchToTab(tabId);
        this.editor.focus();
    }

    async saveCurrentFile() {
        if (!this.activeTab) return;

        const tab = this.openTabs.get(this.activeTab);
        const content = tab.model.getValue();

        if (tab.filePath) {
            // Save existing file
            const result = await window.electronAPI.saveFile(tab.filePath, content);
            if (result.success) {
                this.markTabModified(this.activeTab, false);
                this.addToConsole('File saved successfully');
            } else {
                this.addToConsole(`Error saving file: ${result.error}`);
            }
        } else {
            // Trigger save as dialog through main process
            // This will be handled by the onSaveFileAs listener
            this.addToConsole('Please use Save As for untitled files');
        }
    }

    async saveFileAs(filePath) {
        if (!this.activeTab) return;

        const tab = this.openTabs.get(this.activeTab);
        const content = tab.model.getValue();
        const result = await window.electronAPI.saveFile(filePath, content);

        if (result.success) {
            const tab = this.openTabs.get(this.activeTab);
            tab.filePath = filePath;
            tab.fileName = filePath.split('/').pop();

            this.updateTabTitle(this.activeTab);
            this.markTabModified(this.activeTab, false);
            this.updateStatusFile(filePath);
            this.addToConsole('File saved successfully');
        } else {
            this.addToConsole(`Error saving file: ${result.error}`);
        }
    }

    openFile(filePath, content) {
        const fileName = filePath.split('/').pop();
        const existingTab = Array.from(this.openTabs.entries())
            .find(([id, tab]) => tab.filePath === filePath);

        if (existingTab) {
            this.switchToTab(existingTab[0]);
            return;
        }

        const tabId = this.createTab(fileName, filePath);
        const tab = this.openTabs.get(tabId);

        // Set content in the tab's model
        tab.model.setValue(content);

        this.switchToTab(tabId);
        this.markTabModified(tabId, false);

        // Update file explorer highlighting
        this.renderFileTree();
    }

    createTab(fileName, filePath) {
        const tabId = `tab-${Date.now()}`;

        // Create a separate Monaco model for this file
        const model = monaco.editor.createModel('', 'plaintext');

        // Set up change listener for this specific model
        model.onDidChangeContent(() => {
            // Find the tab that owns this model
            for (const [id, tab] of this.openTabs) {
                if (tab.model === model) {
                    this.markTabModified(id, true);
                    break;
                }
            }
        });

        const tab = {
            id: tabId,
            fileName,
            filePath,
            modified: false,
            model: model
        };

        this.openTabs.set(tabId, tab);

        // Create tab element
        const tabElement = document.createElement('button');
        tabElement.className = 'tab';
        tabElement.dataset.tabId = tabId;
        tabElement.innerHTML = `
            <span class="tab-name">${fileName}</span>
            <button class="tab-close" onclick="event.stopPropagation(); lumosEditor.closeTab('${tabId}')">&times;</button>
        `;

        tabElement.addEventListener('click', () => this.switchToTab(tabId));

        document.getElementById('tab-bar').appendChild(tabElement);
        return tabId;
    }

    switchToTab(tabId) {
        // Deactivate current tab
        const currentActive = document.querySelector('.tab.active');
        if (currentActive) {
            currentActive.classList.remove('active');
        }

        // Activate new tab
        const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
        tabElement.classList.add('active');

        this.activeTab = tabId;
        const tab = this.openTabs.get(tabId);
        this.updateStatusFile(tab.filePath || tab.fileName);

        // Switch to this tab's model
        this.editor.setModel(tab.model);

        // Enable editor and configure for file editing
        this.editor.updateOptions({
            readOnly: false,
            lineNumbers: 'on',
            renderLineHighlight: 'all',
            minimap: { enabled: true }
        });

        // Set Monaco editor language based on file extension or filename
        if (tab.fileName) {
            let language = 'plaintext';

            // Special case for .lumos_ws files (JSON without .json extension)
            if (tab.fileName === '.lumos_ws') {
                language = 'json';
            } else {
                const ext = tab.fileName.split('.').pop().toLowerCase();

                switch (ext) {
                    case 'ino':
                        language = 'arduino';
                        break;
                    case 'c':
                    case 'h':
                        language = 'c';
                        break;
                    case 'cpp':
                    case 'hpp':
                        language = 'cpp';
                        break;
                    case 'js':
                        language = 'javascript';
                        break;
                    case 'py':
                        language = 'python';
                        break;
                    case 'json':
                        language = 'json';
                        break;
                }
            }

            monaco.editor.setModelLanguage(tab.model, language);
        }

        // Update file explorer highlighting
        this.renderFileTree();
    }

    closeTab(tabId) {
        const tab = this.openTabs.get(tabId);
        if (tab && tab.modified) {
            if (!confirm(`${tab.fileName} has unsaved changes. Close anyway?`)) {
                return;
            }
        }

        // Remove tab element
        const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
        tabElement.remove();

        // Dispose of the Monaco model to free memory
        if (tab && tab.model) {
            tab.model.dispose();
        }

        // Remove from tabs map
        this.openTabs.delete(tabId);

        // If this was the active tab, switch to another tab or reset editor
        if (this.activeTab === tabId) {
            const remainingTabs = Array.from(this.openTabs.keys());
            if (remainingTabs.length > 0) {
                this.switchToTab(remainingTabs[0]);
            } else {
                this.activeTab = null;
                this.resetEditor();
                this.updateStatusFile('No file open');
            }
        }

        // Update file explorer highlighting
        this.renderFileTree();
    }

    resetEditor() {
        // Reset editor to empty state when no file is open
        this.editor.setValue('');
        this.editor.updateOptions({
            readOnly: true,
            lineNumbers: 'off',
            renderLineHighlight: 'none',
            minimap: { enabled: false }
        });
        monaco.editor.setModelLanguage(this.editor.getModel(), 'plaintext');
    }

    markTabModified(tabId, modified) {
        const tab = this.openTabs.get(tabId);
        if (tab) {
            tab.modified = modified;
            this.updateTabTitle(tabId);
        }
    }

    updateTabTitle(tabId) {
        const tab = this.openTabs.get(tabId);
        const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
        const tabNameElement = tabElement?.querySelector('.tab-name');
        const tabCloseElement = tabElement?.querySelector('.tab-close');

        if (tab && tabNameElement && tabCloseElement) {
            tabNameElement.textContent = tab.fileName;

            if (tab.modified) {
                tabElement.classList.add('modified');
            } else {
                tabElement.classList.remove('modified');
            }
        }
    }

    async refreshSerialPorts() {
        try {
            this.serialPorts = await window.electronAPI.getSerialPorts();
            this.updatePortSelect();
        } catch (error) {
            this.addToConsole(`Error refreshing ports: ${error.message}`);
        }
    }

    updatePortSelect() {
        const portSelect = document.getElementById('port-select');
        portSelect.innerHTML = '<option value="">Select Port...</option>';

        this.serialPorts.forEach(port => {
            const option = document.createElement('option');
            option.value = port.path;
            option.textContent = `${port.path} (${port.manufacturer || 'Unknown'})`;
            portSelect.appendChild(option);
        });
    }

    updateInitProjectButton() {
        const initButton = document.getElementById('init-project-btn');

        if (!this.currentWorkspace) {
            initButton.classList.add('hidden');
            return;
        }

        // Check if .lumos_ws file exists in the workspace
        const hasLumosFile = this.currentWorkspace.fileTree.some(item =>
            item.type === 'file' && item.name === '.lumos_ws'
        );

        if (hasLumosFile) {
            initButton.classList.add('hidden');
        } else {
            initButton.classList.remove('hidden');
        }
    }

    async initializeProject() {
        if (!this.currentWorkspace) {
            this.addToConsole('No workspace open');
            return;
        }

        try {
            const result = await window.electronAPI.initializeProject(this.currentWorkspace.path);
            if (result.success) {
                this.addToConsole('Project initialized successfully!');
                this.addToConsole('Created .lumos_ws file and project structure');
                // File watcher will automatically update the UI
            } else {
                this.addToConsole(`Error initializing project: ${result.error}`);
            }
        } catch (error) {
            this.addToConsole(`Error initializing project: ${error.message}`);
        }
    }

    async compileCode() {
        const boardType = document.getElementById('board-select').value;

        // Check if workspace is open
        if (!this.currentWorkspace) {
            this.addToConsole('No workspace open. Please open a folder first.');
            return;
        }

        if (!boardType) {
            this.addToConsole('Please select a board type');
            return;
        }

        this.addToConsole(`Compiling workspace with ARM GCC for ${boardType}...`);
        this.showPanel('output');

        // Clear previous output
        document.getElementById('build-output').textContent = '';

        try {
            // Compile the entire workspace
            const result = await window.electronAPI.compileWithArmGcc();

            if (result.success) {
                this.addToConsole('ARM GCC compilation successful!');

                // Display the detailed output
                if (result.output) {
                    this.addToOutput(result.output);
                }

                // Display paths to generated files
                if (result.elfPath) {
                    this.addToConsole(`ELF file: ${result.elfPath}`);
                }
                if (result.binPath) {
                    this.addToConsole(`Binary file: ${result.binPath}`);
                }
            } else {
                this.addToConsole(`ARM GCC compilation failed`);

                // Display the detailed output (includes error info)
                if (result.output) {
                    this.addToOutput(result.output);
                }

                // Display error message
                if (result.error) {
                    this.addToConsole(`Error: ${result.error}`);
                    this.addToOutput(`\nError: ${result.error}`);
                }

                // Display stderr if available
                if (result.stderr) {
                    this.addToOutput(`\nCompiler errors:\n${result.stderr}`);
                }
            }
        } catch (error) {
            this.addToConsole(`ARM GCC compilation error: ${error.message}`);
            this.addToOutput(`ARM GCC compilation error: ${error.message}`);
        }
    }

    async flashToDevice() {
        const port = document.getElementById('port-select').value;
        const boardType = document.getElementById('board-select').value;

        // Get code from active tab's model
        let code = '';
        if (this.activeTab) {
            const tab = this.openTabs.get(this.activeTab);
            code = tab.model.getValue();
        }

        if (!port) {
            this.addToConsole('Please select a port first');
            return;
        }

        if (!boardType) {
            this.addToConsole('Please select a board type');
            return;
        }

        this.addToConsole(`Flashing to ${port} (${boardType})...`);
        this.showPanel('output');

        try {
            const result = await window.electronAPI.flashDevice(port, code, boardType);
            if (result.success) {
                this.addToOutput(result.message);
            } else {
                this.addToOutput(`Flash failed: ${result.error}`);
            }
        } catch (error) {
            this.addToOutput(`Flash error: ${error.message}`);
        }
    }

    async sendSerialData() {
        const input = document.getElementById('serial-input');
        const data = input.value.trim();

        if (data && this.serialConnected) {
            this.addToSerial(`> ${data}`);
            input.value = '';

            try {
                await window.electronAPI.serialWrite(data);
            } catch (error) {
                this.addToSerial(`Send error: ${error.message}`);
            }
        } else if (data && !this.serialConnected) {
            this.addToSerial('Not connected to serial port');
        }
    }

    async connectToSerial(port, baudRate = 9600) {
        try {
            this.addToConsole(`Connecting to ${port}...`);
            const result = await window.electronAPI.serialConnect(port, baudRate);

            if (result.success) {
                this.serialConnected = true;
                this.updateConnectionStatus(port);
                this.addToSerial(`Connected to ${port} at ${baudRate} baud`);
                this.showPanel('serial');
            } else {
                this.addToConsole(`Failed to connect: ${result.error}`);
                this.updateConnectionStatus('');
            }
        } catch (error) {
            this.addToConsole(`Connection error: ${error.message}`);
            this.updateConnectionStatus('');
        }
    }

    async disconnectSerial() {
        if (this.serialConnected) {
            try {
                await window.electronAPI.serialDisconnect();
                this.serialConnected = false;
                this.updateConnectionStatus('');
                this.addToSerial('Disconnected from serial port');
            } catch (error) {
                this.addToConsole(`Disconnect error: ${error.message}`);
            }
        }
    }

    async loadWorkspace() {
        try {
            const workspace = await window.electronAPI.getWorkspaceInfo();
            if (workspace) {
                this.currentWorkspace = workspace;
                this.updateWorkspaceUI();
                this.renderFileTree();
                this.updateInitProjectButton();
            } else {
                // No workspace loaded, show welcome screen
                this.currentWorkspace = null;
                this.updateWorkspaceUI();
            }
        } catch (error) {
            console.error('Error loading workspace:', error);
            // On error, show welcome screen
            this.currentWorkspace = null;
            this.updateWorkspaceUI();
        }
    }

    async openFolderDialog() {
        try {
            await window.electronAPI.openFolderDialog();
        } catch (error) {
            this.addToConsole(`Error opening folder dialog: ${error.message}`);
        }
    }

    updateWorkspaceUI() {
        if (this.currentWorkspace) {
            // Remove no-workspace class from body
            document.body.classList.remove('no-workspace');

            // Hide welcome screen
            document.getElementById('welcome-screen').classList.add('hidden');

            // Show workspace info
            document.getElementById('workspace-name').textContent = this.currentWorkspace.name;
            document.getElementById('workspace-path').textContent = this.currentWorkspace.path;
            document.getElementById('workspace-info').classList.remove('hidden');

            // Hide "no folder" message and show file tree
            document.getElementById('no-folder-message').style.display = 'none';
            document.getElementById('file-tree').classList.remove('hidden');
        } else {
            // Add no-workspace class to body
            document.body.classList.add('no-workspace');

            // Show welcome screen
            document.getElementById('welcome-screen').classList.remove('hidden');

            // Hide workspace info
            document.getElementById('workspace-info').classList.add('hidden');

            // Show "no folder" message and hide file tree
            document.getElementById('no-folder-message').style.display = 'block';
            document.getElementById('file-tree').classList.add('hidden');
        }
    }

    renderFileTree() {
        if (!this.currentWorkspace || !this.currentWorkspace.fileTree) {
            return;
        }

        const fileTreeContainer = document.getElementById('file-tree');
        fileTreeContainer.innerHTML = '';

        this.renderFileTreeItems(this.currentWorkspace.fileTree, fileTreeContainer);
    }

    renderFileTreeItems(items, container) {
        items.forEach((item, index) => {
            const itemElement = document.createElement('div');
            itemElement.className = `file-item ${item.type}`;

            // Add expanded class for directories
            if (item.type === 'directory' && this.expandedDirectories.has(item.path)) {
                itemElement.classList.add('expanded');
            }

            // Add highlighting for opened and active files
            if (item.type === 'file') {
                const openTab = Array.from(this.openTabs.entries())
                    .find(([id, tab]) => tab.filePath === item.path);

                if (openTab) {
                    itemElement.classList.add('file-opened');

                    if (openTab[0] === this.activeTab) {
                        itemElement.classList.add('file-active');
                    }
                }
            }

            // Create icon element
            const icon = document.createElement('img');
            icon.className = 'file-icon';
            if (item.type === 'directory') {
                icon.src = this.getFolderIcon(this.expandedDirectories.has(item.path));
            } else {
                icon.src = this.getFileIcon(item.name, item.extension);
            }
            icon.alt = '';

            // Create text node
            const textSpan = document.createElement('span');
            textSpan.className = 'file-name';
            textSpan.textContent = item.name;

            itemElement.appendChild(icon);
            itemElement.appendChild(textSpan);
            itemElement.dataset.path = item.path;
            itemElement.dataset.type = item.type;

            // Add click handler
            itemElement.addEventListener('click', (e) => {
                e.stopPropagation();
                this.handleFileTreeClick(item);
            });

            container.appendChild(itemElement);

            // Render children for directories
            if (item.type === 'directory' && item.children) {
                const childrenContainer = document.createElement('div');
                childrenContainer.className = 'file-children';

                if (!this.expandedDirectories.has(item.path)) {
                    childrenContainer.classList.add('collapsed');
                }

                this.renderFileTreeItems(item.children, childrenContainer);
                container.appendChild(childrenContainer);
            }
        });
    }

    async handleFileTreeClick(item) {
        if (item.type === 'directory') {
            // Toggle directory expansion
            if (this.expandedDirectories.has(item.path)) {
                this.expandedDirectories.delete(item.path);
            } else {
                this.expandedDirectories.add(item.path);
            }
            this.renderFileTree();
        } else if (item.type === 'file') {
            // Open file
            await this.openWorkspaceFile(item);
        }
    }

    async openWorkspaceFile(fileItem) {
        try {
            const result = await window.electronAPI.readWorkspaceFile(fileItem.path);
            if (result.success) {
                this.openFile(fileItem.path, result.content);
            } else {
                this.addToConsole(`Error opening file: ${result.error}`);
            }
        } catch (error) {
            this.addToConsole(`Error opening file: ${error.message}`);
        }
    }

    async handleExternalFileChange(tabId, tab, filePath) {
        // Check if the file has unsaved changes
        if (tab.modified) {
            // File has unsaved changes, ask user what to do
            const reload = confirm(
                `${tab.fileName} has been changed externally.\n\n` +
                `You have unsaved changes in this file.\n\n` +
                `Do you want to reload the file and lose your changes?`
            );

            if (reload) {
                await this.reloadFileFromDisk(tabId, filePath);
            }
        } else {
            // No unsaved changes, automatically reload
            await this.reloadFileFromDisk(tabId, filePath);
            this.addToConsole(`${tab.fileName} reloaded (changed externally)`);
        }
    }

    async reloadFileFromDisk(tabId, filePath) {
        try {
            const result = await window.electronAPI.readWorkspaceFile(filePath);
            if (result.success) {
                const tab = this.openTabs.get(tabId);
                if (tab && tab.model) {
                    // Save cursor position
                    const position = this.activeTab === tabId ? this.editor.getPosition() : null;

                    // Update the model content
                    tab.model.setValue(result.content);

                    // Restore cursor position if this is the active tab
                    if (position && this.activeTab === tabId) {
                        this.editor.setPosition(position);
                    }

                    // Mark as not modified
                    this.markTabModified(tabId, false);
                }
            } else {
                this.addToConsole(`Error reloading file: ${result.error}`);
            }
        } catch (error) {
            this.addToConsole(`Error reloading file: ${error.message}`);
        }
    }

    increaseFontSize() {
        if (this.currentFontSize < 30) { // Maximum font size limit
            this.currentFontSize += 1;
            this.updateEditorFontSize();
        }
    }

    decreaseFontSize() {
        if (this.currentFontSize > 8) { // Minimum font size limit
            this.currentFontSize -= 1;
            this.updateEditorFontSize();
        }
    }

    resetFontSize() {
        this.currentFontSize = 14;
        this.updateEditorFontSize();
    }

    updateEditorFontSize() {
        if (this.editor) {
            this.editor.updateOptions({
                fontSize: this.currentFontSize
            });
        }
    }

    showPanel(panelName) {
        // Update tab buttons
        document.querySelectorAll('.panel-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.panel === panelName);
        });

        // Update panels
        document.querySelectorAll('.panel').forEach(panel => {
            panel.classList.toggle('active', panel.id === `${panelName}-panel`);
        });
    }

    updateStatusFile(fileName) {
        document.getElementById('status-file').textContent = fileName || 'No file open';
    }

    updateConnectionStatus(port) {
        const status = port ? `Connected to ${port}` : 'Disconnected';
        document.getElementById('status-connection').textContent = status;
    }

    addToConsole(message) {
        this.addToPanel('console-output', message, 'info');
    }

    addToSerial(message) {
        this.addToPanel('serial-output', message, 'serial');
    }

    addToOutput(message) {
        this.addToPanel('build-output', message, 'output');
    }

    addToPanel(panelId, message, type = 'info') {
        const panel = document.getElementById(panelId);
        const timestamp = new Date().toLocaleTimeString();
        const line = `[${timestamp}] ${message}\n`;
        panel.textContent += line;
        panel.scrollTop = panel.scrollHeight;
    }
}

// Initialize the application
let lumosEditor;
document.addEventListener('DOMContentLoaded', () => {
    lumosEditor = new LumosEditor();
});