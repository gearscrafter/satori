// Tiny stand-ins for the base classes of the common state management packages,
// so the example can show how Satori reads them without needing Flutter or
// network access. Satori recognises a state holder by the NAME of the class it
// extends, so these behave like the real ones for the diagram.

abstract class Cubit<S> {
  Cubit(this.state);

  S state;

  void emit(S next) => state = next;
}

abstract class StateNotifier<S> {
  StateNotifier(this.state);

  S state;
}

class ChangeNotifier {
  void notifyListeners() {}
}

class GetxController {}

class BuildContext {}

extension ReadContext on BuildContext {
  T read<T>() => throw UnimplementedError();
  T watch<T>() => throw UnimplementedError();
}

class BlocBuilder<B, S> {
  const BlocBuilder({required this.builder});

  final String Function(S state) builder;
}

class Get {
  static T find<T>() => throw UnimplementedError();
}
