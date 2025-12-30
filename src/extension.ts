import * as vscode from 'vscode';
import * as path from 'path';
import { ZipExplorerProvider } from './ZipExplorerProvider';
import { ZipContentProvider, isBinaryFile, isImageFile, extractFileFromZip } from './ZipContentProvider';

export function activate(context: vscode.ExtensionContext) {
	console.log('Zip View extension is now active');

	// Register the content provider for zip file contents
	const zipContentProvider = new ZipContentProvider();
	context.subscriptions.push(
		vscode.workspace.registerTextDocumentContentProvider('zipview', zipContentProvider)
	);

	// Register command to open files from within zip archives
	const openFileCommand = vscode.commands.registerCommand(
		'zipExplorer.openFile',
		async (uri: vscode.Uri, fileName: string, zipPath: string, internalPath: string) => {
			try {
				// Handle binary files differently
				if (isBinaryFile(fileName)) {
					if (isImageFile(fileName)) {
						// Show images in a webview
						await showImageInWebview(context, zipPath, internalPath, fileName);
					} else {
						// For other binary files, show a message
						vscode.window.showInformationMessage(
							`Cannot preview binary file: ${fileName}`
						);
					}
					return;
				}

				// Open text files normally
				const doc = await vscode.workspace.openTextDocument(uri);
				await vscode.window.showTextDocument(doc, { preview: true });
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				vscode.window.showErrorMessage(`Failed to open file: ${message}`);
			}
		}
	);
	context.subscriptions.push(openFileCommand);

	// Register command to show zip file in workspace explorer
	const showInWorkspaceCommand = vscode.commands.registerCommand(
		'zipExplorer.showInWorkspace',
		async (item: { zipUri: vscode.Uri }) => {
			if (item?.zipUri) {
				await vscode.commands.executeCommand('revealInExplorer', item.zipUri);
			}
		}
	);
	context.subscriptions.push(showInWorkspaceCommand);

	// Create the ZipExplorerProvider
	const zipExplorerProvider = new ZipExplorerProvider();

	// Register the tree data provider
	const treeView = vscode.window.createTreeView('zipExplorer', {
		treeDataProvider: zipExplorerProvider,
		showCollapseAll: true
	});

	// Add disposables to context subscriptions
	context.subscriptions.push(treeView);
	context.subscriptions.push(...zipExplorerProvider.getWatchers());
	context.subscriptions.push({
		dispose: () => {
			zipExplorerProvider.dispose();
			zipContentProvider.dispose();
		}
	});
}

/**
 * Shows an image from a zip file in a webview panel
 */
async function showImageInWebview(
	context: vscode.ExtensionContext,
	zipPath: string,
	internalPath: string,
	fileName: string
): Promise<void> {
	const panel = vscode.window.createWebviewPanel(
		'zipImagePreview',
		fileName,
		vscode.ViewColumn.One,
		{ enableScripts: false }
	);

	try {
		const imageData = await extractFileFromZip(zipPath, internalPath);
		const base64 = imageData.toString('base64');
		const ext = path.extname(fileName).toLowerCase().slice(1);
		const mimeType = getMimeType(ext);

		panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>${fileName}</title>
	<style>
		body {
			margin: 0;
			padding: 20px;
			display: flex;
			justify-content: center;
			align-items: center;
			min-height: calc(100vh - 40px);
			background: var(--vscode-editor-background);
		}
		img {
			max-width: 100%;
			max-height: 100%;
			object-fit: contain;
		}
	</style>
</head>
<body>
	<img src="data:${mimeType};base64,${base64}" alt="${fileName}" />
</body>
</html>`;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		panel.webview.html = `<html><body><p>Error loading image: ${message}</p></body></html>`;
	}
}

/**
 * Get MIME type for an image extension
 */
function getMimeType(ext: string): string {
	const mimeTypes: Record<string, string> = {
		'png': 'image/png',
		'jpg': 'image/jpeg',
		'jpeg': 'image/jpeg',
		'gif': 'image/gif',
		'bmp': 'image/bmp',
		'ico': 'image/x-icon',
		'webp': 'image/webp',
		'svg': 'image/svg+xml'
	};
	return mimeTypes[ext] || 'application/octet-stream';
}

export function deactivate() {}
