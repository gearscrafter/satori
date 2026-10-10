# Contributing to Satori

Contributions are welcome.

## Development

### Environment Setup

```bash
# Clone repository
git clone https://github.com/gearscrafter/satori.git
cd satori

# Install dependencies
npm install

# Build the extension bundle (and copy the translations)
node esbuild.js            # development build
npm run build              # production build

# Rebuild on every change
npm run watch

# Run in development mode
F5 (from VS Code) -> "Satori: run on dummy_app"
```

`e2e/dummy_app` is a small Dart project used to try the extension; the F5 configuration opens it directly.

### Project Structure

```
src/
├── extension.ts              # Main entry point
├── ui/                       # User interface
│   ├── extension_lifecycle.ts
│   ├── webview_creator.ts
│   └── providers/
├── analysis/                 # Code analysis
│   ├── symbol_processor.ts
│   ├── symbol_transformer.ts
│   └── enrichment/
├── graph/                    # Graph construction
│   ├── graph_builder.ts
│   ├── node_creator.ts
│   └── edge_creator.ts
├── packages/                 # Package management
│   └── graph_integration/
├── lsp/                      # LSP integration
├── core/                     # Utilities and algorithms
└── types/                    # Type definitions

media/
├── webviewContent.html       # Webview shell
└── trail/                    # The diagram, free of build steps
    ├── trail_model.js        # Pure graph model: layers, aggregation, focus, trace
    ├── trail_view.js         # Rendering, interaction, legend and edit mode
    ├── trail_paint.js        # Pure drawing logic (shapes, undo/redo, hit testing)
    ├── trail_icons.js        # Icon set
    └── trail.css             # Palette and styles

e2e/
├── dummy_app/                # Small Dart project to try the extension
├── fixtures/                 # Graph captured from the dummy app, used by tests
├── run.js                    # Launches VS Code with Dart-Code and runs suite.js
└── suite.js                  # End-to-end checks
```

### Testing

```bash
# Unit tests (inside the VS Code extension host)
npm test

# End to end: installs Dart-Code in a test instance, opens e2e/dummy_app,
# runs "Analyze Current Project" and checks the graph and the webview
npm run test:e2e

# Incremental analysis: edits, adds and deletes files of a copy of dummy_app and checks that
# analysing again only what changed gives exactly the graph of a full analysis
npm run test:e2e:incremental
```

The graph model, drawing logic and icon set are plain JavaScript without DOM access, so they are covered by regular unit tests.

## Sending a change

Please:

1. Fork the project
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request
