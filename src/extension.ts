import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { ZipExplorerProvider } from './ZipExplorerProvider';
import { ZipContentProvider, isBinaryFile, isImageFile, extractFileFromZip } from './ZipContentProvider';
import { initLogger, logger } from './logger';

export function activate(context: vscode.ExtensionContext) {
	// Initialize logger first
	initLogger(context);
	logger.info('Zip View extension is now active');

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
						// Extract to temp file and open with VS Code's native image viewer
						await openImageWithNativeViewer(context, zipPath, internalPath, fileName);
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
				logger.error('Failed to open file', { fileName, error: message });
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

	// Register refresh command
	const refreshCommand = vscode.commands.registerCommand(
		'zipExplorer.refresh',
		() => {
			zipExplorerProvider.refresh();
		}
	);
	context.subscriptions.push(refreshCommand);

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
 * Opens an image from a zip file using VS Code's native image viewer.
 * Extracts the image to a temp file and opens it.
 */
async function openImageWithNativeViewer(
	context: vscode.ExtensionContext,
	zipPath: string,
	internalPath: string,
	fileName: string
): Promise<void> {
	// Create temp directory for extracted images if needed
	const tempDir = path.join(os.tmpdir(), 'zipview-images');
	await fs.promises.mkdir(tempDir, { recursive: true });

	// Create a unique filename to avoid conflicts
	const zipName = path.basename(zipPath, '.zip');
	const safePath = internalPath.replace(/[/\\]/g, '_');
	const tempFilePath = path.join(tempDir, `${zipName}_${safePath}`);

	// Extract and write the image
	const imageData = await extractFileFromZip(zipPath, internalPath);
	await fs.promises.writeFile(tempFilePath, imageData);

	// Open with VS Code's native viewer
	const fileUri = vscode.Uri.file(tempFilePath);
	await vscode.commands.executeCommand('vscode.open', fileUri);

	logger.debug('Opened image with native viewer', { tempFile: tempFilePath });
}

export function deactivate() {}
