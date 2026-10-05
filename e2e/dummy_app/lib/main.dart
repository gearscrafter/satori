import 'services/user_repository.dart';
import 'state/user_controller.dart';
import 'views/user_view.dart';

Future<void> main() async {
  final controller = UserController(UserRepository());
  await controller.register('1', 'Ada', 30);
  print(await UserView(controller).render());
}
