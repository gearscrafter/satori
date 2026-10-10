# Your own architecture (`satori.json`)

Satori groups classes into **View, State, Service and Model** and flags a use that goes back up that order. If your project is organised another way, say so in a `satori.json` at the root of the project. It is shared through the repository, so the whole team sees the same layers, and VS Code validates it and suggests keys while you type.

**The quickest way is a preset:**

```json
{ "architecture": { "preset": "clean" } }
```

| Preset | Layers | Rule |
|--------|--------|------|
| `default` | View, State, Service, Model (+ utility) | Using a layer above yours is a violation |
| `clean` | Presentation, Domain, Data (+ core) | Presentation and data may use the domain; the domain uses nothing; presentation does not use data |
| `mvvm` | View, View model, Model (+ core) | Views use view models and view models use the model, never the other way round |
| `folders` | One layer per folder of `lib/` (or `lib/src/`), read from your project | None: the layers only group the classes |

**`folders` is the one that needs no knowledge of your architecture.** `lib/views` becomes "Views", `lib/services` "Services", and so on, ordered from the screens down to the data (views, state, logic, data, models) when the folder name says what it holds. Shared folders (`core`, `utils`, `theme`, `l10n`...) go together into the neutral layer, and so does everything outside the folders (`lib/main.dart`). It reads the folders when the project is analysed, so a new folder is a new layer. No dependency is flagged until you ask: add `"rules": { "mode": "order" }` to treat the order shown as the rule, or write `allow` pairs. It reads the first level; for a folder per feature (`lib/features/login/...`) use `clean` or `mvvm`, which look at any depth.

The folders of the other presets match **at any depth** (`**/presentation/**`), so they work with `lib/src/`, with a folder per feature (`lib/features/login/presentation/`) and in a monorepo. Write your own folders the same way: `lib/presentation/**` only matches that exact path, `**/presentation/**` matches it anywhere.

A preset is a starting point. What you write is merged into it: a layer with the id of one of the preset adds your folders, names and extends to its own and replaces its label and colour; a layer with a new id is added; `rules` replace the ones of the preset key by key. `"mode": "none"` applies no rule at all.

```json
{
  "architecture": {
    "preset": "clean",
    "layers": [
      { "id": "domain", "folders": ["lib/business/**"] },
      { "id": "infra", "folders": ["**/infra/**"] }
    ],
    "rules": { "allow": [["presentation", "domain"], ["data", "domain"], ["infra", "domain"]] }
  }
}
```

**Or write every layer yourself:**

```json
{
  "architecture": {
    "layers": [
      { "id": "presentation", "label": "Presentation", "folders": ["lib/presentation/**"], "color": "#1e88e5" },
      { "id": "domain", "label": "Domain", "folders": ["lib/domain/**"], "names": ["*UseCase"] },
      { "id": "data", "label": "Data", "folders": ["lib/data/**"], "names": ["*Repository*"] },
      { "id": "core", "label": "Core", "neutral": true, "folders": ["lib/core/**"] }
    ],
    "rules": {
      "mode": "allow",
      "allow": [["presentation", "domain"], ["data", "domain"]]
    }
  }
}
```

- **Placing a class by hand.** Right-click a class in the diagram and choose **Move to layer**: it changes column at once and is saved in `overrides` (the file is created if there is none). **Back to automatic** removes it.
- **Placing a class.** In this order: `overrides` (by class name), the `folders` of its file, what it `extends`, its `names` (`*Page` ends with, `Base*` starts with, `*Repo*` contains), then Satori's own guess if you keep it (`heuristic`), and last the neutral layer. A folder wins over a name.
- **The neutral layer** (`"neutral": true`) takes no part in the rules and receives libraries and whatever matches nothing. If none is marked, one called "other" is added.
- **Rules.** `"mode": "order"` (the default): a layer may use the ones after it in the list and using one before it is a violation, with `allow` listing exceptions. `"mode": "allow"`: only the `[from, to]` pairs in `allow` are permitted, which is how "everything points to the domain" is written. `forbid` lists pairs that are always a violation. Using a layer from itself and inheritance are never violations.
- **Colours, labels, descriptions and icons** are optional (`layer-view`, `layer-state`, `layer-service`, `layer-model`, `layer-utility`, `layer-generic`); the legend and the layer bar use them.
- **If most classes land in the neutral layer**, the overview says so and lists the folders of your project: the folders or names of your layers do not match it. Try a preset, or use `**/name/**` instead of `lib/name/**`.
- **Mistakes** are reported in a warning and in the "satori" output, and what is wrong is left out; a file that is not valid JSON falls back to the default layers.
- Changing the file analyses the project again (the saved analysis depends on it). `e2e/clean_app` is an example with its `satori.json`.
