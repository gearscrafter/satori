import 'shims.dart';

class ProfileController extends GetxController {
  String name = 'Ada';

  void rename(String next) => name = next;
}
