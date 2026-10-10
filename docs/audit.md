# How the audit decides

Every number in the audit is either a standard threshold or relative to your own project, and the panel says which:

- **God Class** follows the detection strategy of Lanza and Marinescu (*Object-Oriented Metrics in Practice*): a class is flagged when it is very complex (**WMC ≥ 47**, the sum of the cyclomatic complexity of its methods), uses many attributes of other classes (**ATFD > 5**) and has little cohesion (**TCC < 1/3**, the share of method pairs that use a common attribute). The three thresholds are the `satori.audit.godClass.*` settings. Those thresholds come from Java projects, so treat them as a starting point.
- **Cyclomatic complexity** is estimated from the source of each method: one path plus one for every `if`, `for`, `while`, `case`, `catch`, `&&`, `||`, `??` and ternary `?`.
- **Circular dependencies** are groups of classes that depend on each other in a circle (strongly connected components of the class graph).
- **Layer violations** are dependencies that go against the flow View → State → Service → Model. The layer of each class is a heuristic based on names and structure, so it can be wrong.
- **Coupling and size** are *relative*: a class is compared with the most connected and the largest class of your project, not with a fixed number. They show where to look first, not what is wrong.
- **Risk** mixes the four factors with the weights above (they are normalised, so only their proportions matter). Each hot class lists the reasons and the numbers behind them.
- **Start here** lists the classes the most others are tied to (how many use them plus how many they use), and the overview shows the first five as chips. Reading them first explains how the rest fits together.
- **Possibly unused** lists classes that nothing else in the project builds, names as a type, extends or calls. `main()` builds the app, so entry points are not in it. A class that is only reached through a string (a route name) or by generated code cannot be seen, so check before deleting.
