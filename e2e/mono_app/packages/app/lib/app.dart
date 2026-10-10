import 'package:core/repo.dart';

class AppState {
  final Repo repo = Repo();

  int value() => repo.load();
}

class AppScreen {
  AppScreen(this.state);

  final AppState state;

  String render() => '${state.value()}';
}
