import { Logger, createLoggerFromConfig } from '@timheuer/vscode-ext-logger';
import type { ExtensionContext } from 'vscode';

/**
 * Shared logger instance for the extension.
 * Must be initialized via initLogger() during extension activation.
 */
export let logger: Logger;

/**
 * Initialize the logger with configuration monitoring.
 * Call this once in the extension's activate function.
 */
export function initLogger(context: ExtensionContext): void {
    logger = createLoggerFromConfig(
        'Zip Viewer',     // Logger name (appears in Output panel)
        'zipView',        // Config section  
        'logLevel',       // Config key
        'info',           // Default level
        true,             // Output channel enabled
        context,          // Extension context for cleanup
        true              // Enable config monitoring for real-time updates
    );
}
