import * as vscode from 'vscode';
import JSZip from 'jszip';
import * as fs from 'fs';
import * as path from 'path';

// Default security constants (can be overridden via settings)
const DEFAULT_MAX_FILE_SIZE_MB = 10;
const DEFAULT_MAX_COMPRESSION_RATIO = 100;
const DEFAULT_MAX_CACHE_SIZE = 50;

/**
 * Get configuration values with defaults
 */
function getConfig() {
    const config = vscode.workspace.getConfiguration('zipView');
    return {
        maxFileSize: (config.get<number>('maxFileSize') ?? DEFAULT_MAX_FILE_SIZE_MB) * 1024 * 1024,
        maxCompressionRatio: config.get<number>('maxCompressionRatio') ?? DEFAULT_MAX_COMPRESSION_RATIO,
        maxCacheSize: config.get<number>('maxCacheSize') ?? DEFAULT_MAX_CACHE_SIZE
    };
}

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
 * Sanitize a path from inside a zip file to prevent path traversal attacks.
 * Returns null if the path is suspicious.
 */
export function sanitizeZipPath(internalPath: string): string | null {
    if (!internalPath) {
        return null;
    }
    
    // Normalize path separators to forward slashes
    let normalized = internalPath.replace(/\\/g, '/');
    
    // Remove any leading slashes
    normalized = normalized.replace(/^\/+/, '');
    
    // Split into parts and filter out dangerous components
    const parts = normalized.split('/');
    const safeParts: string[] = [];
    
    for (const part of parts) {
        // Skip empty parts and current directory references
        if (!part || part === '.') {
            continue;
        }
        // Reject parent directory references
        if (part === '..') {
            return null;
        }
        // Reject parts that look like absolute paths (Windows drive letters)
        if (/^[a-zA-Z]:$/.test(part)) {
            return null;
        }
        safeParts.push(part);
    }
    
    if (safeParts.length === 0) {
        return null;
    }
    
    return safeParts.join('/');
}

/**
 * Check if a file is potentially a zip bomb based on compression ratio
 */
export function isZipBomb(compressedSize: number, uncompressedSize: number, maxCompressionRatio?: number): boolean {
    const maxRatio = maxCompressionRatio ?? getConfig().maxCompressionRatio;
    if (compressedSize === 0) {
        return uncompressedSize > 0;
    }
    const ratio = uncompressedSize / compressedSize;
    return ratio > maxRatio;
}

/**
 * Escape HTML special characters to prevent XSS
 */
export function escapeHtml(str: string): string {
    const htmlEscapes: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    };
    return str.replace(/[&<>"']/g, (char) => htmlEscapes[char] || char);
}

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

    // LRU cache with maximum size
    private contentCache = new Map<string, string>();
    private cacheOrder: string[] = [];

    private addToCache(key: string, value: string): void {
        const { maxCacheSize } = getConfig();
        
        // If key exists, remove it from order (will be re-added at end)
        const existingIndex = this.cacheOrder.indexOf(key);
        if (existingIndex !== -1) {
            this.cacheOrder.splice(existingIndex, 1);
        }
        
        // Evict oldest entries if cache is full
        while (this.cacheOrder.length >= maxCacheSize) {
            const oldestKey = this.cacheOrder.shift();
            if (oldestKey) {
                this.contentCache.delete(oldestKey);
            }
        }
        
        // Add new entry
        this.contentCache.set(key, value);
        this.cacheOrder.push(key);
    }

    private getFromCache(key: string): string | undefined {
        const value = this.contentCache.get(key);
        if (value !== undefined) {
            // Move to end of order (most recently used)
            const index = this.cacheOrder.indexOf(key);
            if (index !== -1) {
                this.cacheOrder.splice(index, 1);
                this.cacheOrder.push(key);
            }
        }
        return value;
    }

    async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
        const cacheKey = uri.toString();
        
        // Check cache first
        const cached = this.getFromCache(cacheKey);
        if (cached !== undefined) {
            return cached;
        }

        // Parse the URI: zipview:/internal/path/to/file.txt?zipPath=encodedZipPath
        const rawInternalPath = uri.path.startsWith('/') ? uri.path.slice(1) : uri.path;
        const zipPath = decodeURIComponent(new URLSearchParams(uri.query).get('zipPath') || '');

        if (!zipPath) {
            return 'Error: Missing zip file path in URI.';
        }

        // Sanitize the internal path to prevent path traversal
        const internalPath = sanitizeZipPath(rawInternalPath);
        if (!internalPath) {
            return 'Error: Invalid file path.';
        }

        try {
            const data = await fs.promises.readFile(zipPath);
            const zip = await JSZip.loadAsync(data);
            const file = zip.file(internalPath);

            if (!file) {
                return `Error: File "${escapeHtml(internalPath)}" not found in archive.`;
            }

            // Check file size before extracting
            // Note: _data.uncompressedSize is internal but commonly available
            const fileData = file as JSZip.JSZipObject & { _data?: { uncompressedSize?: number; compressedSize?: number } };
            const uncompressedSize = fileData._data?.uncompressedSize ?? 0;
            const compressedSize = fileData._data?.compressedSize ?? 0;

            const { maxFileSize, maxCompressionRatio } = getConfig();

            if (uncompressedSize > maxFileSize) {
                return `Error: File too large to preview (${Math.round(uncompressedSize / 1024 / 1024)}MB exceeds ${Math.round(maxFileSize / 1024 / 1024)}MB limit).`;
            }

            // Check for zip bomb
            if (isZipBomb(compressedSize, uncompressedSize, maxCompressionRatio)) {
                return 'Error: Suspicious compression ratio detected. File may be a zip bomb.';
            }

            // Try to read as text
            const content = await file.async('string');
            this.addToCache(cacheKey, content);
            return content;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return `Error reading file: ${escapeHtml(message)}`;
        }
    }

    invalidate(uri: vscode.Uri): void {
        const key = uri.toString();
        this.contentCache.delete(key);
        const index = this.cacheOrder.indexOf(key);
        if (index !== -1) {
            this.cacheOrder.splice(index, 1);
        }
        this._onDidChange.fire(uri);
    }

    dispose(): void {
        this._onDidChange.dispose();
        this.contentCache.clear();
        this.cacheOrder = [];
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
    // Sanitize the path
    const safePath = sanitizeZipPath(internalPath);
    if (!safePath) {
        throw new Error('Invalid file path.');
    }

    const data = await fs.promises.readFile(zipPath);
    const zip = await JSZip.loadAsync(data);
    const file = zip.file(safePath);
    
    if (!file) {
        throw new Error(`File "${escapeHtml(safePath)}" not found in archive.`);
    }

    // Check file size
    const fileData = file as JSZip.JSZipObject & { _data?: { uncompressedSize?: number; compressedSize?: number } };
    const uncompressedSize = fileData._data?.uncompressedSize ?? 0;
    const compressedSize = fileData._data?.compressedSize ?? 0;

    const { maxFileSize, maxCompressionRatio } = getConfig();

    if (uncompressedSize > maxFileSize) {
        throw new Error(`File too large (${Math.round(uncompressedSize / 1024 / 1024)}MB exceeds ${Math.round(maxFileSize / 1024 / 1024)}MB limit).`);
    }

    // Check for zip bomb
    if (isZipBomb(compressedSize, uncompressedSize, maxCompressionRatio)) {
        throw new Error('Suspicious compression ratio detected. File may be a zip bomb.');
    }
    
    return file.async('nodebuffer');
}
