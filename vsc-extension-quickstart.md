# Welcome to Satori VS Code Extension

## What's in the folder

* This folder contains all of the files necessary for the Satori extension.
* `package.json` - the manifest file that declares the extension commands and configuration.
* `src/extension.ts` - the main entry point that exports the `activate` function.
* `src/ui/extension_lifecycle.ts` - contains the main extension logic and command implementations.
* `media/webviewContent.html` - the webview shell; `media/trail/` - the diagram itself (plain JavaScript and CSS, no build step).
* `e2e/` - a small Dart project (`dummy_app`) and the end-to-end test that drives VS Code with it.

## Setup

* Run `npm install`.
* Install the recommended extensions:
  - `amodio.tsl-problem-matcher` - TypeScript problem matcher
  - `ms-vscode.extension-test-runner` - Test runner for extensions
  - `dbaeumer.vscode-eslint` - ESLint integration
* The Dart extension (`Dart-Code.dart-code`) must be installed in the window where you try Satori; Satori does not register its commands without it.

## Get up and running straight away

* Open **Run and Debug** (`Ctrl+Shift+D`), choose **Satori: run on dummy_app** and press `F5`.
  It builds the bundle and opens a new window with the extension loaded and `e2e/dummy_app` open.
  Choose **Satori: run (choose project)** to open a window without a project instead.
* Wait a few seconds for the Dart analysis server to start in the new window.
* Run the command from the command palette (`Ctrl+Shift+P` or `Cmd+Shift+P` on Mac):
  - Type `Satori: Analyze Current Project` to automatically analyze the open project
  - Or type `Satori: Show Project Diagram (Folder)` to manually select a project folder
  - Type `Satori: Toggle Debug Logs` to enable debugging output
* Set breakpoints in your code inside `src/extension.ts` or other TypeScript files to debug.
* Find output from your extension in the debug console and the "satori" output channel.
* The `.vscode/` folder is ignored by git; recreate the two launch configurations from this section if you clone the repository elsewhere.

## Make changes

* You can relaunch the extension from the debug toolbar after changing code in any TypeScript file.
* You can also reload (`Ctrl+R` or `Cmd+R` on Mac) the VS Code window with your extension to load your changes.
* Webview files in `media/` are read when the diagram panel is created: close the panel and run the analysis again to see HTML, CSS or JavaScript changes. No rebuild is needed for them.
* Translations live in `src/localization/*.json`. `node esbuild.js` copies them to `localization/`, and the unit tests check that both languages define the same keys.
* A build rewrites `dist/extension.js`, which is tracked by git. Run `git checkout -- dist/extension.js` before committing unless you are preparing a release (`npm run build`).

## Project Structure

```
src/
├── extension.ts              # Main entry point
├── ui/                      # User interface components
├── analysis/                # Code analysis engine, class relations, code snippets
├── graph/                   # Graph construction
├── packages/                # Package management
├── filesystem/              # Project and path helpers
├── lsp/                     # Language Server Protocol integration
├── core/                    # Core utilities and algorithms
└── types/                   # TypeScript type definitions

media/
├── webviewContent.html      # Webview shell (CSP, data and translations are injected)
└── trail/
    ├── trail_model.js       # Pure graph model: layers, aggregation, focus, data-flow trace
    ├── trail_view.js        # Rendering, interaction, legend (HUD) and edit mode
    ├── trail_paint.js       # Pure drawing logic: shapes, undo/redo, hit testing
    ├── trail_icons.js       # Icon set (16x16, inherits currentColor)
    └── trail.css            # Palette and styles

e2e/
├── dummy_app/               # Small Dart project to try the extension
├── fixtures/                # Graph captured from the dummy app, used by unit tests
├── run.js                   # Downloads VS Code, installs Dart-Code and runs suite.js
└── suite.js                 # End-to-end checks, executed inside the extension host
```

## How the webview talks to the extension

The webview sends `getSnippet` (code for a reference), `openClass` (open a file at a range), `showRelationships` / `clearRelationships` (feeds the details panel), `saveAnnotations` (drawings from edit mode) and `ready`. The extension answers with `snippet`. The details panel can ask the diagram to focus a node with `setFocusInGraph` and `setPathHighlight`. All message types are declared in `src/ui/extension_lifecycle.ts`.

## Key Commands

- `satori.analyzeProject` - Automatically analyze the current project
- `extension.showProjectDiagram` - Pick a folder and visualize it
- `satori.toggleDebugLogs` - Enable/disable debug logging

## Explore the API

* Open `node_modules/@types/vscode/index.d.ts` to see the full VS Code API.
* Check `src/types/index.ts` for Satori-specific type definitions.
* Review `src/ui/extension_lifecycle.ts` for the main extension logic.

## Run tests

* `npm test` compiles the tests and runs them inside a VS Code instance (downloaded the first time into `.vscode-test/`).
* `npm run test:e2e` builds the bundle, installs Dart-Code in a test instance, opens `e2e/dummy_app`, runs *Analyze Current Project* and checks the graph and that the webview loads and answers. It needs network access the first time.
* If you launch the tests from a terminal that VS Code opened and see `Code.exe: bad option`, unset `ELECTRON_RUN_AS_NODE` for that command.
* Test files must match `**.test.ts` under `src/test/suite/`.
* `trail_model.js`, `trail_paint.js` and `trail_icons.js` have no DOM access, so their tests are ordinary unit tests; keep new logic there rather than in `trail_view.js` so it stays testable.
* To check the look of the webview without VS Code, load `media/webviewContent.html` in a browser after replacing the `__CSP__`, `__MEDIA__`, `__NONCE__`, `__AST_JSON_PLACEHOLDER__` and `__TRANSLATIONS__` placeholders, and provide a stub for `acquireVsCodeApi`. `e2e/fixtures/dummy_graph.json` is a ready-made graph.

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

## Try the features with the example project

`e2e/dummy_app` is a small Dart project made to exercise Satori. Press `F5` and pick **Satori: run on dummy_app** (see `.vscode/launch.json`), then run the Satori command.

| What to look at | Where in the example |
|-----------------|----------------------|
| Layers, arrows, trace data flow | `UserView` -> `UserController` -> `UserRepository` -> `User` |
| Third-party packages (vertical column) | `CartView` (`args`), `Cart` (`collection`), `ApiClient` (`async`), `UserView` (`path`) |
| Dart SDK bundle | `ApiClient` (`dart:async`, `dart:convert`, `dart:io`) |
| Zoom levels and folders | Focus any class and zoom out to 20%; folders are `models`, `services`, `state`, `utils`, `views`, `widgets` |
| Audit: circular dependency | `ApiClient`, `Cart` and `Product` |
| Audit: layer violation | `OrderData` (a model) uses `ApiClient` (a service) |
| Audit: God Class | `CheckoutManager` (WMC 48, ATFD 8, TCC 0) |
| One layer per folder | Put `{ "architecture": { "preset": "folders" } }` in a `satori.json` next to the `pubspec.yaml` of `e2e/dummy_app` (copy the project first, so the end-to-end checks that expect the default layers keep passing) and analyse it: views, widgets, state, services and models become the layers |
| Your own architecture | `e2e/clean_app` has a `satori.json` with presentation / domain / data / core. Run it with `SATORI_E2E_PROJECT=e2e/clean_app SATORI_E2E_SUITE=e2e/suite_architecture.js node e2e/run.js`, or press `F5` on that folder and open the diagram: `LoginPage.shortcut` reaches into the data layer and is drawn in red |
| State management map | Open `CounterView`: it listens to `CounterCubit` (Bloc), `SessionNotifier` (Provider) and `ProfileController` (GetX). `WishlistStore` (Riverpod) is listened to by nobody. The audit panel warns that four approaches are mixed. The base classes are tiny stand-ins in `lib/state/shims.dart`, so the example needs no extra packages |

The audit thresholds and weights live in the settings `satori.audit.*` (open `Ctrl+,` and search for `satori.audit`). They are read when the analysis runs, so run it again after changing them. Try `satori.audit.godClass.wmc` = `40` and see which classes change.

To time the analysis on a bigger project, point the end-to-end launcher at it and read the timings the extension writes to the "satori" output channel:

```
SATORI_E2E_PROJECT=/path/to/a/project SATORI_E2E_SUITE=/path/to/your_suite.js node e2e/run.js
```

`SATORI_E2E_ENGINE=languageServer node e2e/run.js` runs the example with the slow, symbol-by-symbol engine, to check the fallback.

To check your changes without opening VS Code: `npm test` runs the unit tests (the audit model and the complexity estimate are covered there), and `npm run test:e2e` runs the analysis on the example inside VS Code. To regenerate the graph the unit tests read, run the e2e with `SATORI_E2E_GRAPH_OUT=e2e/fixtures/dummy_graph.json`.

## Testing with Flutter projects

The extension works best with:

- Flutter projects with clear architectural patterns
- Projects using BLoC, Provider, or similar state management
- Projects with multiple packages and dependencies

## Publish to the Visual Studio Marketplace

### One time

1. Make sure the publisher `gearscrafter` exists at <https://marketplace.visualstudio.com/manage>.
2. In Azure DevOps (<https://dev.azure.com>) create a **Personal Access Token** with *Organization: All accessible organizations* and the scope **Marketplace → Manage**.
3. Log in once: `npx vsce login gearscrafter` and paste the token. Keep the token private; never commit it.
4. The README images (`assets/extension.gif`, `assets/extension1.png`) are loaded from the public GitHub repository, so push them before publishing. They are left out of the package on purpose (`.vscodeignore`).

### Every release

1. Bump `version` in `package.json` (it must be higher than the published one) and put the date on the top section of `CHANGELOG.md`.
2. Run the checks: `npm test` and `npm run test:e2e`.
3. Build the package: `npm run vsce:package`. This runs the production build first (`vscode:prepublish`), so `dist/extension.js` is rewritten; commit it if you keep `dist/` in git.
4. Check what goes into the package with `npx vsce ls --no-dependencies`. It should list only `package.json`, `README.md`, `CHANGELOG.md`, `LICENSE`, `dist/`, `localization/`, `media/` and `assets/icon.png`.
5. Try the `.vsix` locally: *Extensions: Install from VSIX...* (or `code --install-extension satori-<version>.vsix`) in a window where the Dart extension is installed.
6. Publish: `npm run vsce:publish`, or `npx vsce publish minor` to bump and publish in one go. You can also upload the `.vsix` by hand from the management page.
7. Tag it: `git tag v<version> && git push --tags`.

Useful variants: `npx vsce publish --pre-release` for a pre-release channel, and `npx ovsx publish satori-<version>.vsix -p <token>` to also publish to Open VSX.

## Go further

* [Bundle your extension](https://code.visualstudio.com/api/working-with-extensions/bundling-extension) to reduce size
* [Publish your extension](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) on the marketplace
* [Continuous Integration](https://code.visualstudio.com/api/working-with-extensions/continuous-integration) for automated builds

## Troubleshooting

* **No symbols found**: Ensure the project has a valid `pubspec.yaml` and run `dart pub get`
* **Performance issues**: Enable debug logs to identify bottlenecks
* **Webview not loading**: Run *Developer: Open Webview Developer Tools* in the Extension Development Host and read the console. Any Content Security Policy error there means a script or style is being loaded from somewhere other than `media/`.
* **Commands missing**: the Dart extension was not active when Satori started. Install it in the Extension Development Host window and reload it.
* **Text appears as keys like `trail.tip.home`**: a translation is missing from `src/localization/*.json`, or `node esbuild.js` has not copied the files to `localization/`.
* **Drawings from edit mode vanished**: they are stored per project root in the workspace state. Analyzing a different folder starts with an empty sheet.