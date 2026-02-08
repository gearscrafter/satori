# Welcome to Satori VS Code Extension

## What's in the folder

* This folder contains all of the files necessary for the Satori extension.
* `package.json` - the manifest file that declares the extension commands and configuration.
* `src/extension.ts` - the main entry point that exports the `activate` function.
* `src/ui/extension_lifecycle.ts` - contains the main extension logic and command implementations.
* `media/` - contains the webview HTML and assets for the interactive diagrams.

## Setup

* Install the recommended extensions:
  - `amodio.tsl-problem-matcher` - TypeScript problem matcher
  - `ms-vscode.extension-test-runner` - Test runner for extensions
  - `dbaeumer.vscode-eslint` - ESLint integration

## Get up and running straight away

* Press `F5` to open a new window with your extension loaded.
* Open a Flutter/Dart project in the new window.
* Run the command from the command palette (`Ctrl+Shift+P` or `Cmd+Shift+P` on Mac):
  - Type `Satori: Analyze Current Project` to automatically analyze the open project
  - Or type `Satori: Show Project Diagram` to manually select a project folder
  - Type `Satori: Toggle Debug Logs` to enable debugging output
* Set breakpoints in your code inside `src/extension.ts` or other TypeScript files to debug.
* Find output from your extension in the debug console and the "Satori" output channel.

## Make changes

* You can relaunch the extension from the debug toolbar after changing code in any TypeScript file.
* You can also reload (`Ctrl+R` or `Cmd+R` on Mac) the VS Code window with your extension to load your changes.
* For webview changes (HTML/CSS/JS), you may need to close and reopen the diagram panel.

## Project Structure

```
src/
├── extension.ts              # Main entry point
├── ui/                      # User interface components
├── analysis/                # Code analysis engine  
├── graph/                   # Graph construction
├── packages/                # Package management
├── lsp/                     # Language Server Protocol integration
├── core/                    # Core utilities and algorithms
└── types/                   # TypeScript type definitions
```

## Key Commands

- `satori.analyzeProject` - Automatically analyze the current project
- `satori.showProjectDiagram` - Main visualization command
- `satori.toggleDebugLogs` - Enable/disable debug logging
- `satori.testLsp` - Test LSP connection (development only)

## Explore the API

* Open `node_modules/@types/vscode/index.d.ts` to see the full VS Code API.
* Check `src/types/index.ts` for Satori-specific type definitions.
* Review `src/ui/extension_lifecycle.ts` for the main extension logic.

## Run tests

* Install the [Extension Test Runner](https://marketplace.visualstudio.com/items?itemName=ms-vscode.extension-test-runner)
* Run the "watch" task via **Tasks: Run Task** command
* Open the Testing view and click "Run Test" or use `Ctrl/Cmd + ; A`
* Test files should match the pattern `**.test.ts`

## Working with the codebase

### For simple changes:
1. Modify the TypeScript files in `src/`
2. Press `F5` to test in a new Extension Development Host window
3. Test with a real Flutter project

### For architecture understanding:
- **Analysis Pipeline**: `src/analysis/` - Symbol extraction and enrichment
- **Graph Construction**: `src/graph/` - Building nodes and edges from symbols
- **UI Layer**: `src/ui/` - Webview creation and user interactions
- **Package Management**: `src/packages/` - External dependencies analysis

## Testing with Flutter projects

The extension works best with:

- Flutter projects with clear architectural patterns
- Projects using BLoC, Provider, or similar state management
- Projects with multiple packages and dependencies

## Go further

* [Bundle your extension](https://code.visualstudio.com/api/working-with-extensions/bundling-extension) to reduce size
* [Publish your extension](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) on the marketplace
* [Continuous Integration](https://code.visualstudio.com/api/working-with-extensions/continuous-integration) for automated builds

## Troubleshooting

* **No symbols found**: Ensure the project has a valid `pubspec.yaml` and run `dart pub get`
* **Performance issues**: Enable debug logs to identify bottlenecks
* **Webview not loading**: Check the browser console in the Extension Development Host