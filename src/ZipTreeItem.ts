import * as vscode from 'vscode';
import * as path from 'path';
import { createZipFileUri } from './ZipContentProvider';

export type ZipItemType = 'zipFile' | 'folder' | 'file';

export class ZipTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly type: ZipItemType,
        public readonly zipUri: vscode.Uri,
        public readonly relativePath: string = '',
        public readonly workspaceRelativePath: string = ''
    ) {
        super(
            label,
            type === 'file'
                ? vscode.TreeItemCollapsibleState.None
                : vscode.TreeItemCollapsibleState.Collapsed
        );

        this.contextValue = type;
        this.tooltip = this.getTooltip();
        
        // Show workspace-relative path as description for zip files
        if (type === 'zipFile' && workspaceRelativePath) {
            // Show parent folder path (without the filename) with leading separator
            // Normalize to OS-appropriate separators
            const normalizedPath = workspaceRelativePath.replace(/[/\\]/g, path.sep);
            const lastSepIndex = normalizedPath.lastIndexOf(path.sep);
            const parentPath = lastSepIndex > 0
                ? path.sep + normalizedPath.substring(0, lastSepIndex)
                : path.sep;
            this.description = parentPath;
        }
        
        // Use resourceUri to get theme-appropriate icons for files and folders
        // For zip files, use archive icon; for others, let the theme handle it
        if (type === 'zipFile') {
            this.iconPath = new vscode.ThemeIcon('archive');
        } else {
            // Set resourceUri so VS Code uses the file icon theme based on filename
            this.resourceUri = vscode.Uri.file(label);
        }

        // Set command to open file when clicked
        if (type === 'file') {
            const fileUri = createZipFileUri(zipUri.fsPath, relativePath);
            this.command = {
                command: 'zipExplorer.openFile',
                title: 'Open File',
                arguments: [fileUri, this.label, zipUri.fsPath, relativePath]
            };
        }
    }

    private getTooltip(): string {
        switch (this.type) {
            case 'zipFile':
                return this.zipUri.fsPath;
            case 'folder':
            case 'file':
                return this.relativePath;
        }
    }
}
