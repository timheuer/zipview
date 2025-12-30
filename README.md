# Zip View

A Visual Studio Code extension that provides a tree view explorer for browsing the contents of zip files in your workspace.

## Features

- **Zip File Explorer** - View all zip files in your workspace in a dedicated tree view in the Explorer sidebar
- **Browse Contents** - Expand zip files to browse their contents without extracting
- **File Preview** - Click on files inside zip archives to view them with proper syntax highlighting
- **Image Preview** - View images (PNG, JPG, GIF, etc.) from within zip files
- **Theme Icons** - Files and folders use your current file icon theme
- **Auto-Refresh** - Automatically updates when zip files are added, removed, or modified
- **Show in Workspace** - Right-click a zip file to reveal it in the default Explorer view

## Usage

1. Open a workspace containing zip files
2. Look for the "Zip Files" section in the Explorer sidebar
3. Expand any zip file to browse its contents
4. Click on a file to preview it

## Supported File Types

### Text Files
All text-based files open with proper syntax highlighting based on their extension (`.js`, `.ts`, `.css`, `.json`, `.xml`, `.md`, etc.)

### Images
The following image formats are displayed in a preview panel:
- PNG, JPG, JPEG, GIF, BMP, ICO, WebP, SVG

### Binary Files
Other binary files (executables, PDFs, etc.) cannot be previewed but are listed in the tree.

## Requirements

- VS Code 1.107.0 or higher

## Extension Settings

This extension contributes the following settings:

| Setting | Default | Description |
|---------|---------|-------------|
| `zipView.maxFileSize` | `10` | Maximum file size (in MB) that can be previewed from zip archives. |
| `zipView.maxCompressionRatio` | `100` | Maximum allowed compression ratio for zip entries. Files exceeding this ratio are blocked as potential zip bombs. |
| `zipView.maxCacheSize` | `50` | Maximum number of file contents to cache in memory for faster access. |

> ⚠️ **Warning**: Increasing these values above their defaults may cause high memory usage or crashes. The defaults are set to balance functionality with security and performance.

## Known Issues

- Large zip files may take a moment to load on first expansion
- Binary files other than images cannot be previewed

## Release Notes

### 0.0.1

Initial release:
- Zip file tree view in Explorer
- File content preview with syntax highlighting
- Image preview support
- File system watcher for auto-refresh
- Show in Workspace context menu

## License

[MIT](LICENSE.md)
