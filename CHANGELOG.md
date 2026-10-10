# Changelog

## [2.4.0] - 10-09-2026

### Added

- **More relationships between classes.** A member that builds a class (`Repo()`, `const Cart()`) or names it as a type (a field, a parameter, a return type, a generic argument, a cast) now draws an arrow to it, in the **types** group of the filters. This is also how a class injected with `getIt<Repo>()`, `context.read<Repo>()` or `Get.find<Repo>()` appears. A mixin applied with `with` is drawn like an implemented interface. Projects that rely on injection no longer look emptier than they are. The example project goes from 125 to 172 relationships.

### Fixed

- **Building the graph of a big project is much faster.** For every method Satori tested one pattern per name in the project, so the time grew with methods x names. It now reads the called names once per method and looks them up. On a real Flutter app of 1,700 files (27,600 nodes, 48,000 relationships) this step went from 62 s to 2 s with exactly the same result.
- Analyses saved by an earlier version are ignored, so the new relationships appear without clearing anything.

## [2.3.0] - 10-09-2026

### Added

- **Move a class to another layer from the diagram.** Right-click a class (or one of its members) and choose **Move to layer**: the class changes column at once and the choice is written to `architecture.overrides` in `satori.json`, so the team shares it. If there is no `satori.json` it is created next to `pubspec.yaml` with the default layers, so nothing else changes. **Back to automatic** gives the class back to the analysis. A `satori.json` that is not valid JSON is never overwritten, and moving a class does not make the saved analysis stale.

## [2.2.1] - 10-07-2026

### Fixed

- **An empty or partial diagram stayed that way when the project was opened again.** An analysis was saved even when Dart's language server, still starting, had answered "no symbols" for most files, and reopening reused it. Now an analysis is saved only when it found classes in at least half of the files, and the saved ones from before (which carry no such record) are ignored.
- **The wait for Dart's language server is no longer a fixed 8 seconds.** When most files come back empty, Satori asks again, only about those files, in rounds of 3, 5, 8, 12, 15, 20, 25 and 30 seconds, and keeps waiting while each round brings more files back (up to about two minutes). It stops as soon as the answers are complete, or after two rounds with nothing new, so a project with nothing to find still waits about 8 seconds. A big project that needed a minute no longer ends up with an empty diagram.
- If the result is still incomplete it says so, lists the likely reasons in the "satori" output (workspace not trusted, Dart extension not active, no `pubspec.yaml`, no `.dart_tool/package_config.json`, files left out by `satori.analysis.exclude`, server still starting) and offers **Analyze again** and **Show details**.

### Added

- `satori.reanalyze` (**Analyze Current Project (ignore saved analysis)**) and `satori.clearCache` (**Clear Saved Analyses**) commands.
- The diagram of a project with no classes explains what usually causes it and has an **Analyze again** button.

## [2.2.0] - 10-07-2026

### Added

- **Your own architecture** (`satori.json` at the root of the project, with a JSON schema so VS Code validates it and suggests keys). Define the layers (id, label, description, colour, icon), place classes by folder, by what they extend, by name or by hand (`overrides`), choose which layer takes no part in the rules, and write the rules as an order (`"mode": "order"`, with exceptions in `allow` and extra prohibitions in `forbid`) or as a list of permitted pairs (`"mode": "allow"`, for presentation / domain / data and similar). The overview columns, the layer bar, the legend, the audit and the red violation arrows all follow it. Without the file the four layers of before are used and nothing changes.
- **Presets** for `satori.json`: `{ "architecture": { "preset": "clean" } }` (presentation / domain / data) or `"mvvm"` (view / view model / model) is a complete file, and `"default"` is the four layers of before, written out so it can be extended. Their folders match at any depth (`**/presentation/**`), so they work with `lib/src/`, a folder per feature and monorepos. What the file adds is merged into the preset.
- **`"preset": "folders"`**: one layer per folder of `lib/` (or `lib/src/`), read from the project, ordered from the screens down to the data when the folder name says what it holds, with the shared folders (`core`, `utils`, `theme`...) together in the neutral layer. It applies no rule until the file asks for one, which needs the new `"mode": "none"` (no rule at all).
- A note in the overview when most classes land in the neutral layer, with the folders of the project, and a line in the "satori" output with how many classes were placed.
- `e2e/clean_app`, an example with a Clean Architecture layout, its `satori.json` and a deliberate violation, and `e2e/suite_architecture.js` to check it in VS Code.

### Changed

- A class's layer can be any text, not only view, state, service, model or utility. The saved analysis also depends on `satori.json`.

## [2.1.1] - 10-07-2026

### Fixed

- **A big project could take over an hour to open.** Where each field and method is used was asked to the
  language server one symbol at a time, thousands of requests on a big project. It is now read from Dart's
  analysis server, one request per file. A generated project of 600 files went from 60 s to 7 s, and 3,000 files
  take about two minutes, mostly waiting for the Dart extension's own server. If the analysis server cannot be
  started the language server is used as before.
- **The progress notification showed raw text and a bar that did not mean anything.** The file counter read
  "Analyzing {0} ({1}/{2})..." and the increments added up to more than 100. The notification at the bottom right
  now shows the step that is running with its counter, the real overall percentage and the elapsed time, which
  keeps counting every second so a long step does not look frozen. English and Spanish.
- The scrollable area of the diagram follows the canvas when it changes height by itself, instead of staying at
  the size it had before a fold finished.


## [2.1.0] - 10-06-2026

### Added

- **Audit mode** (flame button): a heat map from cool to red over every box, and a panel with the circular
  dependencies, the layer violations and the hottest classes. Each hot class says why (a broken layer, a
  circle, a God Class, its coupling or size) with the numbers behind it, in the panel, in a tooltip and under
  the focused class. Folded containers take the heat of the hottest class inside.
- **God Class by the Lanza and Marinescu rule** (WMC >= 47, ATFD > 5, TCC < 1/3), with the cyclomatic
  complexity of every method computed by the extension. The three thresholds and the four risk weights are
  settings (`satori.audit.*`); they are read when the analysis runs.
- **State management map**: classes get a tag with their approach (Bloc / Cubit, ChangeNotifier, Riverpod
  notifiers, GetX controllers), read from the base class they extend, and a new `OBSERVES` arrow goes from a
  widget to the holder it listens to (`BlocBuilder<X>`, `context.read/watch/select<X>()`, `Provider.of<X>`,
  `Get.find<X>`). A holder is always in the state layer. The audit panel has a state management column that
  lists the approaches in use, how many classes listen to each holder and a warning when more than one
  approach is mixed. Riverpod providers are not followed to their classes.
- **Zoom as nested containers** (20%-200%, buttons, `Ctrl` + wheel, `+` / `-` / `0`): zooming out folds the
  members of the neighbouring boxes, then each layer into a container that still lists the names it holds,
  and finally regroups the boxes by project folder. What is drawn keeps a readable size instead of
  shrinking into empty space. Zoomed out, the layer bar keeps only the layers that take part in the focused
  class and the class shows the layer or folder that contains it. Tapping a folded container, or a name
  inside it, brings the zoom back; the overview folds the same way.
- **Dependency column**: Flutter, third-party packages and the Dart SDK stack vertically next to the
  focused class, each library as its own node with its own arrow, built from the real `import` and
  `export` lines (the project's own imports are left out). The SDK starts folded, like Sourcetrail's
  "Non-indexed Symbols" bundle. Clicking an arrow lists the import lines and shows the exact one in the code.
- **Navigable libraries**: a library is a node you can focus. It shows which classes import it, opens its
  source file when it can be found (`.dart_tool/package_config.json` and the Dart SDK), and appears as a
  foldable bundle in the overview. The classes inside a library are not analysed.
- **Example project** (`e2e/dummy_app`) with more folders, the packages `path`, `collection`, `args` and
  `async`, stand-ins for the four state management approaches, and deliberate smells for the audit: a
  circular dependency, a model that reaches into a service and a God Class.

### Changed

- A class that extends a known state holder (`Cubit`, `Bloc`, `ChangeNotifier`, `StateNotifier`,
  `GetxController`...) is always placed in the state layer, whatever its name.
- The built-in legend (`?`) explains the audit, the state management tags and the zoom levels.


## [2.0.0] - 10-05-2026

### Added

- **Trail view**: the diagram is rebuilt around one focused element. Everything that uses it
  sits on the left, everything it uses on the right, and arrows always read left to right.
- **Nested boxes**: layer container -> class box -> member pills, with a smooth transition when
  navigating (existing boxes glide, new ones unfold from the centre box).
- **Aggregated arrows**: one arrow per pair of classes with a reference counter. Clicking it
  lists every reference and shows the code with the exact line highlighted; the editor opens on
  that line without taking focus from the diagram.
- **Layer flow bar**: references between View -> State -> Service -> Model, with architecture
  violations (references going against the flow) drawn in red.
- **Navigation history**: back / forward buttons, breadcrumbs, `Alt+←` / `Alt+->`, and a search
  box (`/`) for any class or member.
- **Data flow trace**: right-click any class or member -> *Trace data flow*. Providers are
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

- **Field access analysis**: methods now get `READS_FROM`, `WRITES_TO` and `PASSES_AS_ARGUMENT` edges to
  the fields and properties they touch. Each reference found by the Dart language server is classified
  from its surrounding text (assignment, compound assignment, increment, bare argument, `this.field`
  constructor parameters in one-line and multi-line headers). Before, no edge touched a field at all.
- **Large diagrams**: a focused class draws its most connected neighbours (12 per side) with a
  "show N more" button and the real total in the column title; members are capped at 16; the overview
  folds layers beyond 30 classes and has a **folder filter**.
- **Analysis timing**: a summary line (find files, symbols, enrichment, graph, page) is written to the
  "satori" output channel after each analysis.

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

- **Calls were matched by name only.** Every `load()` was linked to every `load()` in the project (a
  150-class test project produced 179,400 `CALLS` edges instead of the 750 real ones), and a method was
  reported as calling itself because its own name appears in its signature. Signatures are now ignored
  and methods that share a name are resolved with the language server's references.
- **The language server's empty answers were cached as "no references".** While it is still analysing,
  it can answer an empty list even for a symbol's own declaration, so the graph changed from run to run.
  Empty answers are now asked again after a short wait, and the same applies to the symbols of a file,
  which could otherwise drop its classes from the diagram. Gives up after several in a row so a server
  that cannot answer does not slow the analysis.
- The project's own package no longer shows up as an empty "external package" container.
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

- Symbols of each file are requested 8 at a time instead of one by one (about half the time spent there).
- `e2e/run.js` accepts `SATORI_E2E_PROJECT` and `SATORI_E2E_SUITE` to try another project or check.
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
