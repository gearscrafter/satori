import 'shims.dart';

class SessionNotifier extends ChangeNotifier {
  String? user;

  void login(String name) {
    user = name;
    notifyListeners();
  }
}
