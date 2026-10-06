import 'package:path/path.dart' as p;

import '../state/user_controller.dart';

class UserView {
  final UserController controller;

  UserView(this.controller);

  Future<String> render() async {
    final adult = await controller.isCurrentAdult();
    return adult ? 'adult' : 'minor';
  }

  String route(String section) => p.join('users', section);
}
