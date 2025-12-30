import * as vscode from 'vscode';
import JSZip from 'jszip';
import * as fs from 'fs';
import * as path from 'path';

// Binary file extensions that should be opened differently
const BINARY_EXTENSIONS = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.svg',
    '.pdf', '.zip', '.tar', '.gz', '.7z', '.rar',
    '.exe', '.dll', '.so', '.dylib',
    '.woff', '.woff2', '.ttf', '.otf', '.eot',
    '.mp3', '.mp4', '.wav', '.avi', '.mov', '.webm',
    '.class', '.pyc', '.o', '.obj'
]);

/**
 * Check if a file is binary based on its extension
 */
export function isBinaryFile(filename: string): boolean {
    const ext = path.extname(filename).toLowerCase();
    return BINARY_EXTENSIONS.has(ext);
}

/**
 * Check if a file is an image
 */
export function isImageFile(filename: string): boolean {
    const ext = path.extname(filename).toLowerCase();
    return ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.svg'].includes(ext);
}

/**
 * Provides content for files inside zip archives using a virtual document scheme.
 * URI format: zipview:/internal/path/to/file.txt?zipPath=/path/to/archive.zip
 * This format preserves the filename so VS Code can detect the language.
 */
export class ZipContentProvider implements vscode.TextDocumentContentProvider {
    private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
    readonly onDidChange = this._onDidChange.event;

    private contentCache = new Map<string, string>();

    async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
        const cacheKey = uri.toString();
        
        // Check cache first
        if (this.contentCache.has(cacheKey)) {
            return this.contentCache.get(cacheKey)!;
        }

        // Parse the URI: zipview:/internal/path/to/file.txt?zipPath=encodedZipPath
        const internalPath = uri.path.startsWith('/') ? uri.path.slice(1) : uri.path;
        const zipPath = decodeURIComponent(new URLSearchParams(uri.query).get('zipPath') || '');

        if (!zipPath) {
            return 'Error: Missing zip file path in URI.';
        }

        try {
            const data = await fs.promises.readFile(zipPath);
            const zip = await JSZip.loadAsync(data);
            const file = zip.file(internalPath);

            if (!file) {
                return `Error: File "${internalPath}" not found in archive.`;
            }

            // Try to read as text
            const content = await file.async('string');
            this.contentCache.set(cacheKey, content);
            return content;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return `Error reading file: ${message}`;
        }
    }

    invalidate(uri: vscode.Uri): void {
        this.contentCache.delete(uri.toString());
        this._onDidChange.fire(uri);
    }

    dispose(): void {
        this._onDidChange.dispose();
        this.contentCache.clear();
    }
}

/**
 * Creates a URI for a file inside a zip archive.
 * Format: zipview:/internal/path/to/file.txt?zipPath=encodedZipPath
 */
export function createZipFileUri(zipPath: string, internalPath: string): vscode.Uri {
    return vscode.Uri.parse(`zipview:/${internalPath}`).with({
        query: `zipPath=${encodeURIComponent(zipPath)}`
    });
}

/**
 * Extracts a file from a zip archive and returns it as a Buffer
 */
export async function extractFileFromZip(zipPath: string, internalPath: string): Promise<Buffer> {
    const data = await fs.promises.readFile(zipPath);
    const zip = await JSZip.loadAsync(data);
    const file = zip.file(internalPath);
    
    if (!file) {
        throw new Error(`File "${internalPath}" not found in archive.`);
    }
    
    return file.async('nodebuffer');
}
