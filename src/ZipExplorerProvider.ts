import * as vscode from 'vscode';
import JSZip from 'jszip';
import * as fs from 'fs';
import { ZipTreeItem } from './ZipTreeItem';
import { logger } from './logger';

/**
 * Format bytes into a human-readable string
 */
function formatBytes(bytes: number): string {
    if (bytes === 0) { return '0 B'; }
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export class ZipExplorerProvider implements vscode.TreeDataProvider<ZipTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<ZipTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private zipFiles: vscode.Uri[] = [];
    private zipContentsCache = new Map<string, JSZip>();
    private watchers: vscode.FileSystemWatcher[] = [];
    private disposables: vscode.Disposable[] = [];

    constructor() {
        this.setupWatchers();
        this.scanForZipFiles();
        
        // Also watch for workspace folder changes
        this.disposables.push(
            vscode.workspace.onDidChangeWorkspaceFolders(() => {
                this.setupWatchers();
                this.scanForZipFiles();
            })
        );
    }

    private setupWatchers(): void {
        // Dispose existing watchers
        this.watchers.forEach(w => w.dispose());
        this.watchers = [];

        // Create watchers for each workspace folder
        const workspaceFolders = vscode.workspace.workspaceFolders || [];
        
        for (const folder of workspaceFolders) {
            const pattern = new vscode.RelativePattern(folder, '**/*.zip');
            const watcher = vscode.workspace.createFileSystemWatcher(pattern);

            watcher.onDidCreate((uri) => {
                logger.debug('Zip file created', { path: uri.fsPath });
                this.invalidateCache(uri);
                this.scanForZipFiles();
            });

            watcher.onDidDelete((uri) => {
                logger.debug('Zip file deleted', { path: uri.fsPath });
                this.invalidateCache(uri);
                this.scanForZipFiles();
            });

            watcher.onDidChange((uri) => {
                logger.debug('Zip file changed', { path: uri.fsPath });
                this.invalidateCache(uri);
                this.refresh();
            });

            this.watchers.push(watcher);
        }
        
        // Fallback watcher if no workspace folders
        if (workspaceFolders.length === 0) {
            const watcher = vscode.workspace.createFileSystemWatcher('**/*.zip');

            watcher.onDidCreate((uri) => {
                this.invalidateCache(uri);
                this.scanForZipFiles();
            });

            watcher.onDidDelete((uri) => {
                this.invalidateCache(uri);
                this.scanForZipFiles();
            });

            watcher.onDidChange((uri) => {
                this.invalidateCache(uri);
                this.refresh();
            });

            this.watchers.push(watcher);
        }
    }

    private invalidateCache(uri: vscode.Uri): void {
        this.zipContentsCache.delete(uri.fsPath);
    }

    private async scanForZipFiles(): Promise<void> {
        this.zipFiles = await vscode.workspace.findFiles('**/*.zip');
        logger.info('Workspace scan complete', { zipFilesFound: this.zipFiles.length });
        this.refresh();
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: ZipTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: ZipTreeItem): Promise<ZipTreeItem[]> {
        if (!element) {
            // Return all zip files in the workspace
            return this.zipFiles.map((uri) => {
                const fileName = uri.fsPath.split(/[\\/]/).pop() || uri.fsPath;
                const workspaceRelativePath = vscode.workspace.asRelativePath(uri, false);
                return new ZipTreeItem(fileName, 'zipFile', uri, '', workspaceRelativePath);
            });
        }

        if (element.type === 'zipFile') {
            // Load zip contents and return top-level entries
            const zip = await this.loadZip(element.zipUri);
            if (!zip) {
                return [];
            }
            return this.getEntriesAtPath(zip, '', element.zipUri);
        }

        if (element.type === 'folder') {
            // Return children of this folder
            const zip = await this.loadZip(element.zipUri);
            if (!zip) {
                return [];
            }
            return this.getEntriesAtPath(zip, element.relativePath, element.zipUri);
        }

        return [];
    }

    private async loadZip(uri: vscode.Uri): Promise<JSZip | null> {
        // Check cache first
        if (this.zipContentsCache.has(uri.fsPath)) {
            logger.debug('Zip loaded from cache', { path: uri.fsPath });
            return this.zipContentsCache.get(uri.fsPath)!;
        }

        try {
            const data = await fs.promises.readFile(uri.fsPath);
            const zip = await JSZip.loadAsync(data);
            
            // Count entries for logging
            let fileCount = 0;
            let folderCount = 0;
            let totalUncompressedSize = 0;
            zip.forEach((_, zipEntry) => {
                if (zipEntry.dir) {
                    folderCount++;
                } else {
                    fileCount++;
                    // Access internal data for size info
                    const entryData = zipEntry as JSZip.JSZipObject & { _data?: { uncompressedSize?: number } };
                    totalUncompressedSize += entryData._data?.uncompressedSize ?? 0;
                }
            });
            
            const archiveSizeBytes = data.length;
            const compressionRatio = totalUncompressedSize > 0 ? (totalUncompressedSize / archiveSizeBytes).toFixed(2) : 'N/A';
            
            logger.info('Zip archive opened', {
                path: uri.fsPath,
                archiveSize: formatBytes(archiveSizeBytes),
                totalFiles: fileCount,
                totalFolders: folderCount,
                uncompressedSize: formatBytes(totalUncompressedSize),
                compressionRatio
            });
            
            this.zipContentsCache.set(uri.fsPath, zip);
            return zip;
        } catch (error) {
            logger.error('Error loading zip file', { path: uri.fsPath, error });
            return null;
        }
    }

    private getEntriesAtPath(zip: JSZip, basePath: string, zipUri: vscode.Uri): ZipTreeItem[] {
        const entries: ZipTreeItem[] = [];
        const seenFolders = new Set<string>();

        // Normalize base path (ensure it ends with / if not empty)
        const normalizedBase = basePath ? (basePath.endsWith('/') ? basePath : basePath + '/') : '';

        zip.forEach((relativePath, zipEntry) => {
            // Skip the base path itself
            if (relativePath === normalizedBase) {
                return;
            }

            // Check if this entry is a direct child of the base path
            if (!relativePath.startsWith(normalizedBase)) {
                return;
            }

            // Get the relative path from the base
            const relativeFromBase = relativePath.slice(normalizedBase.length);

            // Skip empty paths
            if (!relativeFromBase) {
                return;
            }

            // Check if this is a direct child (no additional path separators, except trailing /)
            const parts = relativeFromBase.split('/').filter(p => p.length > 0);

            if (parts.length === 0) {
                return;
            }

            if (parts.length === 1) {
                // Direct child
                const name = parts[0];
                const isFolder = zipEntry.dir || relativePath.endsWith('/');

                if (isFolder) {
                    if (!seenFolders.has(name)) {
                        seenFolders.add(name);
                        entries.push(new ZipTreeItem(name, 'folder', zipUri, normalizedBase + name));
                    }
                } else {
                    entries.push(new ZipTreeItem(name, 'file', zipUri, relativePath));
                }
            } else {
                // This is a nested entry - we need to create the intermediate folder
                const folderName = parts[0];
                if (!seenFolders.has(folderName)) {
                    seenFolders.add(folderName);
                    entries.push(new ZipTreeItem(folderName, 'folder', zipUri, normalizedBase + folderName));
                }
            }
        });

        // Sort: folders first, then files, alphabetically within each group
        entries.sort((a, b) => {
            if (a.type === 'folder' && b.type !== 'folder') {
                return -1;
            }
            if (a.type !== 'folder' && b.type === 'folder') {
                return 1;
            }
            return a.label.localeCompare(b.label);
        });

        return entries;
    }

    getWatchers(): vscode.FileSystemWatcher[] {
        return this.watchers;
    }

    dispose(): void {
        this.watchers.forEach(w => w.dispose());
        this.disposables.forEach(d => d.dispose());
        this._onDidChangeTreeData.dispose();
    }
}
