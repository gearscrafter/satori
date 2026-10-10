# Satori (Preview)

![Preview](https://img.shields.io/badge/Status-Preview-orange?style=for-the-badge)
![Flutter](https://img.shields.io/badge/Flutter-Analyzer-blue?style=for-the-badge&logo=flutter)
![VS Code Extension](https://img.shields.io/badge/VS%20Code-Extension-purple?style=for-the-badge&logo=visualstudiocode)

**See how your Flutter/Dart project fits together.** Satori turns your code into an interactive diagram: which classes use which, how data flows between them, and where the architecture is breaking down.

![Satori Demo](./assets/extension.gif)

## Quick start

1. Install the **Dart** extension (Dart-Code) and open a Flutter/Dart project.
2. Let Dart finish analysing it (the Dart status in the status bar).
3. Run **Satori: Analyze Current Project** (`Ctrl+Shift+P`).

The first analysis of a big project takes a few minutes, with progress in the notification at the bottom right. After that, opening it again takes seconds, and changing a few files only analyses those files again.

<img src="./assets/extension1.png" width="600" alt="Focus View">

## What you can do with it

**Find your way around**
- **Overview**: every class in a column per layer. The **Start here** chips point to the classes the most others depend on.
- **Focus view**: pick a class and see who uses it on the left and what it uses on the right, with its members in the middle.
- **Search** with `/`, **back/forward** through the classes you visited, **zoom** that folds layers into folders when you zoom out.
- Click an arrow to read **the exact code** that creates the connection.

**Understand how data moves**
- **Trace data flow**: right-click a class or method and the diagram rearranges so data reads from left to right.
- **State management map**: Bloc/Cubit, Provider/ChangeNotifier, Riverpod and GetX are tagged, and an arrow goes from each widget to the state holder it listens to.

**Check the architecture**
- **Layers**: View, State, Service and Model by default, or your own with a [`satori.json`](docs/satori-json.md) (presets for Clean Architecture, MVVM, or one layer per folder).
- **Violations** appear in red in the layer bar when a class uses a layer it should not.
- **Audit** (flame button): a heat map by risk, circular dependencies, layer violations, God Classes, and a list of classes that look unused. See [how it decides](docs/audit.md).
- **Move to layer**: right-click a class to correct the layer Satori guessed. It is saved in `satori.json` for the whole team.

**Make notes**
- **Edit mode** (`E`): draw over the diagram with a pen, arrows and shapes. Drawings are saved per project.

## Relationships

| Arrow | Meaning |
|-------|---------|
| Extends / Implements (dotted) | Inheritance, interfaces and `with` mixins |
| Calls | A method calls another |
| Reads / Writes | A method reads or writes a field |
| Creates / Uses as type | A member builds a class (`Repo()`) or names it as a type, including `getIt<Repo>()` and `context.read<Repo>()` |
| Observes | A widget listens to a state holder (`BlocBuilder`, `ref.watch(provider)`, `Get.find`...) |
| Red, dashed | Goes against the layer flow |

Press `?` in the diagram for the full legend.

## Commands

| Command | What it does |
|---------|--------------|
| `Satori: Analyze Current Project` | Analyse the project and open the diagram |
| `Satori: Analyze Current Project (ignore saved analysis)` | Analyse everything again: the way out of an empty or out-of-date diagram |
| `Satori: Show Project Diagram (Folder)` | Pick a folder by hand and open its diagram |
| `Satori: Clear Saved Analyses` | Delete the saved analyses of every project |
| `Satori: Toggle Debug Logs` | Detailed logs in the "satori" output channel |

## Keyboard

| Key | Action |
|-----|--------|
| `/` | Search a class or member |
| `+` `-` `0` | Zoom in, out, reset |
| `Alt+←` `Alt+→` | Back, forward |
| `E` | Edit mode |
| `?` | Legend |
| `Esc` | Close the legend, clear the trace or the selection |

## Settings

| Setting | Default | What it does |
|---------|---------|--------------|
| `satori.language` | `en` | Interface language: `en` or `es` |
| `satori.dartSdkPath` | empty | Path to the Dart SDK, if it is not found automatically |
| `satori.analysis.exclude` | generated code | Globs of files left out (`*.g.dart`, `*.freezed.dart`, `generated/`...). Empty analyses everything |
| `satori.analysis.engine` | `auto` | `auto` asks Dart's analysis server once per file (fast); `languageServer` asks symbol by symbol (slow on big projects) |
| `satori.cache.enabled` | `true` | Saves the analysis. Opening again is instant, and a few changed files are analysed on their own |
| `satori.loading.phrases` | `true` | Short geek and anime phrases in the notification during a long analysis |
| `satori.audit.*` | see the settings UI | Thresholds and weights of the audit |
| `satori.enableDebugLogs` | `false` | Detailed logs |

## Your own architecture

Satori guesses the layer of each class. To tell it how *your* project is organised, add a `satori.json` at the root:

```json
{ "architecture": { "preset": "clean" } }
```

`default`, `clean` (presentation / domain / data), `mvvm`, and `folders` (one layer per folder of `lib/`, with no rules) are ready to use. VS Code validates and completes the file as you type. Everything else (your own layers, rules, names, folders) is in **[docs/satori-json.md](docs/satori-json.md)**.

## Troubleshooting

**The diagram is empty or has few classes.** Dart's server was probably still starting and answered "no symbols". Wait for Dart to finish, then run **Analyze Current Project (ignore saved analysis)**. Satori already waits for the server, and when it still finds classes in fewer than half of the files it says so and lists the likely reasons in the "satori" output: workspace not trusted, Dart extension inactive, no `pubspec.yaml` or `.dart_tool/package_config.json` (run `flutter pub get`), or files left out by `satori.analysis.exclude`. An incomplete analysis is never saved.

**A diagram looks out of date.** Run **Clear Saved Analyses**, or set `satori.cache.enabled` to `false`.

**It is slow.** The first analysis of a project is the slow one: Dart has to analyse every file (about two minutes for 1,700 files). Close other big projects, and keep generated code excluded. Later analyses reuse what was saved.

For anything else, turn on `satori.toggleDebugLogs` and read the "satori" output channel.

## Limitations

- It needs the **Dart extension**, its language server, and a trusted workspace.
- It shows which packages a file **imports**, not the classes inside packages or the Dart SDK.
- State holders are recognised by the **base class** they extend. Riverpod providers are followed through `ref.watch`, `ref.read` and `ref.listen`, and `@riverpod` ones too; `BlocProvider(create: ...)` is not drawn, only who listens.
- A method whose name is unique in the project is matched **by name**, so your own `add()` can be confused with `list.add(x)`.
- **Possibly unused** classes may be reached only by a route name or by generated code, which Satori cannot see. Check before deleting.
- A type or creation is **not drawn** towards a class whose name two files share, because the name alone does not say which one it means.
- The **data flow trace** follows calls and field accesses, not values that travel through local variables, return values or callbacks, so it can be shorter than the real flow.
- Big diagrams show the 12 most connected neighbours per side (a button shows the rest) and fold layers over 30 classes.
- The diagram uses a **light palette** whatever the VS Code theme.

## Roadmap

- Export the diagram (PNG, SVG, Mermaid)
- Dark theme
- Other languages (Kotlin, Swift)

## Contributing

Contributions are welcome. See **[CONTRIBUTING.md](CONTRIBUTING.md)** to set up the project, run the tests and send a change.

## License

Apache License 2.0. See [LICENSE](LICENSE).

## Acknowledgments

Dart and Flutter teams for the language server, the VS Code community, and Sourcetrail for the idea of exploring code as a trail of focused graphs.

**Problems or suggestions?** [GitHub Issues](https://github.com/gearscrafter/satori/issues)
