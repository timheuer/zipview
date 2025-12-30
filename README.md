# 📦 Zip Viewer

> Peek inside zip files without ever extracting them!

**Zip Viewer** brings seamless zip file browsing directly into VS Code's Explorer. Browse, preview, and inspect archived files as if they were part of your workspace—no extraction required.

![VS Code](https://img.shields.io/badge/VS%20Code-1.107%2B-blue?logo=visualstudiocode)
![License](https://img.shields.io/badge/license-MIT-green)

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🗂️ **Explorer Integration** | Zip files appear in a dedicated "Zip Files" panel in your Explorer sidebar |
| 🔍 **Browse Without Extracting** | Expand archives to navigate their full directory structure |
| 📄 **Syntax-Highlighted Preview** | Open any text file with full language support—JS, TS, JSON, CSS, Markdown, and more |
| 🖼️ **Image Preview** | View PNG, JPG, GIF, WebP, SVG, and other images using VS Code's native viewer |
| 🎨 **Theme-Aware Icons** | Files and folders display icons from your current file icon theme |
| ⚡ **Live Updates** | Tree automatically refreshes when zip files are added, removed, or changed |
| 📍 **Quick Navigation** | Right-click any zip to reveal it in the workspace Explorer |

## 🚀 Getting Started

1. **Install** the extension from the VS Code Marketplace
2. **Open** a workspace containing `.zip` files
3. **Find** the "Zip Files" panel in your Explorer sidebar
4. **Click** any zip file to expand and browse its contents
5. **Select** a file to preview it instantly

## 📁 Supported File Types

### Text Files
All text-based files open with proper syntax highlighting based on their extension—`.js`, `.ts`, `.py`, `.css`, `.json`, `.xml`, `.md`, `.html`, `.yaml`, and hundreds more.

### Images
Images open in VS Code's built-in image viewer with full zoom and pan support:
- PNG, JPG, JPEG, GIF, BMP, ICO, WebP, SVG

### Binary Files
Other binary files (executables, PDFs, archives) are listed in the tree but cannot be previewed.

## ⚙️ Configuration

Fine-tune the extension's behavior in your VS Code settings:

| Setting | Default | Description |
|---------|---------|-------------|
| `zipView.maxFileSize` | `10` | Max file size (MB) that can be previewed |
| `zipView.maxCompressionRatio` | `100` | Max compression ratio before blocking (zip bomb protection) |
| `zipView.maxCacheSize` | `50` | Number of file contents to cache for faster access |
| `zipView.logLevel` | `info` | Logging verbosity: `off`, `error`, `warn`, `info`, `debug`, `trace` |

> 💡 **Tip**: Defaults are optimized for security and performance. Increase with caution.

## 🔒 Security

Zip Viewer includes built-in protections:
- **Path traversal prevention** — Blocks malicious paths like `../../../etc/passwd`
- **Zip bomb detection** — Refuses to open files with suspicious compression ratios
- **File size limits** — Prevents memory exhaustion from oversized files

## 📋 Requirements

- Visual Studio Code **1.107.0** or higher

## 📄 License

[MIT](LICENSE.md) — Made with ☕ by [Tim Heuer](https://timheuer.com)
