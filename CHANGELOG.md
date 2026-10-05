# Changelog

## [1.0.0] - 10-05-2026

### Added

- **Trail view**: the diagram is rebuilt around one focused element. Everything that uses it
  sits on the left, everything it uses on the right, and arrows always read left to right.
- **Nested boxes**: layer container → class box → member pills, with a smooth transition when
  navigating (existing boxes glide, new ones unfold from the centre box).
- **Aggregated arrows**: one arrow per pair of classes with a reference counter. Clicking it
  lists every reference and shows the code with the exact line highlighted; the editor opens on
  that line without taking focus from the diagram.
- **Layer flow bar**: references between View → State → Service → Model, with architecture
  violations (references going against the flow) drawn in red.
- **Navigation history**: back / forward buttons, breadcrumbs, `Alt+←` / `Alt+→`, and a search
  box (`/`) for any class or member.
- **Data flow trace**: right-click any class or member → *Trace data flow*. Providers are
  placed on the left and consumers on the right with animated arrows; a list in the bottom panel
  shows the whole chain and the code that links each step.
- **Context menu** on classes, members and overview items: trace data flow, focus here, open in
  editor, each with a short description.
- **Movable boxes**: drag a box, or a whole layer container, anywhere. Arrows follow while
  dragging and a button restores the original positions.
- **Edit mode** (`E`): a transparent sheet over the diagram with pen, line, arrow, rectangle,
  ellipse and eraser, six colours, three thicknesses, optional fill, undo / redo and
  show / hide. Drawings are stored per view and per project in the workspace state.
- **Built-in legend** (`?`) that explains layers, box anatomy, every arrow style and the
  available interactions.
- **Icon set**: consistent line icons for layers, classes, methods, fields, packages, toolbar
  actions and drawing tools, replacing text glyphs.
- **Descriptions everywhere**: tooltips on buttons, boxes, members, counters and filters, and
  descriptions inside the context menu. All new text is available in English and Spanish.
- **End-to-end test** (`npm run test:e2e`) that starts VS Code with the Dart extension, opens
  the new `e2e/dummy_app` project, runs the analysis and checks the graph and the webview.

### Changed

- The webview was rewritten. It no longer depends on D3 or on scripts downloaded from a CDN,
  and the Content Security Policy only allows the extension's own files.
- The original light palette is kept: pastel colours per layer, edge colours per relation, and
  yellow / blue pills for methods and fields.
- `activate` now returns a small API (`getGraph`, `getStats`, `focusNode`) used by the tests.
- The data sent to the webview is embedded as JSON instead of a template string.

### Removed

- Folder diagram, package container view, navigation slider, list view and the narrative
  sentences of the previous webview.
- The extension-side `traceDataFlow` request: the trace is now computed inside the webview.

### Fixed

- **Inheritance was never detected** with current Dart-Code versions, which report an empty
  `detail` for classes. `extends`, `implements` and `with` are now read from the class
  declaration, and each clause is parsed separately (generics included).
- **Project classes were labelled as external packages on Windows** because paths were compared
  with different separators and drive-letter case. SDK files were also classified as project
  files on Windows.
- Parameters written as `this.field` looked their field up among constructors instead of
  fields and properties, so their type was not resolved.
- Class lookup when creating `EXTENDS` / `IMPLEMENTS` edges kept the *last* class with a repeated
  name instead of the first (regression introduced in 0.2.5).
- Opening a class from the diagram opened the editor twice because the message was handled in
  two places.
- Text containing `$&`-style sequences could corrupt the HTML generated for the webview.
- Duplicated "Deep enrichment completed" log line.

### Internal

- `analyzeProject` is split into file discovery and symbol extraction; the two analysis commands
  share one implementation.
- Messages between the webview and the extension are typed.
- ESLint `curly` warnings fixed across the code base.
- New unit tests for the graph model, drawing logic, icons, code snippets, path handling,
  class relations, translations and annotation storage.

## [0.2.5] - 06-04-2026

### Performance
 
- **~55% reduction in analysis time** for large Flutter projects
- LSP reference results cached by symbol position — repeated lookups for the same symbol skip the Dart language server entirely

## [0.2.4] - 06-04-2026

### Fixed
- **HTML floating legend**: replaced SVG-based legend with a collapsible
  HTML overlay (top-left of diagram) showing only the symbols and
  relationship types visible on screen. Supports expand/collapse with
  animated toggle icon.

## [0.2.3] - 06-03-2026

### Changed

- **List view indicators**: replaced emoji icons (📥📤) with directional
  arrow badges (`↙` / `↗`) using distinct color ramps — orange for
  incoming dependencies, purple for outgoing — for faster visual scanning.

## [0.2.2] - 06-03-2026

### Fixed

- Adjusted string parsing behavior for Windows-generated output.

## [0.2.1] - 03-27-2026

### Fixed

- **Slider drag** — Fixed rapid level flickering when dragging beyond the track bounds.

## [0.2.0] - 03-26-2026

### Changed

- **`updateFocusViewForFolderLevel`** — Replaced radial layout with a
  left-to-right topological column view. Edges only between adjacent columns,
  colored gray->purple by depth. Cards show name + member count only.

## [0.1.0] - 02-08-2026

### Added

- **Automatic Project Analysis**: New `satori.analyzeProject` command for automatic analysis of the current project
- Automatically detects project root using `pubspec.yaml`
- Updated README with detection strategy

## [0.0.1] - 01-02-2026

### Added

- Interactive visualization of Flutter/Dart architecture.
- Automatic layer analysis (View, State, Service, Model).
- Dependency and relationship navigation.
- Support for external packages.
- Details panel with smart collaborations.

### Features

- Overview view by architectural layers.
- Focus view with dependency neighborhood.
- Hierarchical navigation by folders.
- Full integration with Dart LSP.

## [Unreleased]

- Incremental analysis.
- Diagram export.
- Code quality metrics.
- Folder flow tracing.
