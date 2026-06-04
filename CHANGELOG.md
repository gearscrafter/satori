# Changelog

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
