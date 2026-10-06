import 'dart:async';

import 'services/api_client.dart';
import 'services/user_repository.dart';
import 'state/cart_controller.dart';
import 'state/user_controller.dart';
import 'views/cart_view.dart';
import 'views/user_view.dart';

Future<void> main(List<String> arguments) async {
  final controller = UserController(UserRepository());
  await controller.register('1', 'Ada', 30);
  print(await UserView(controller).render());
  final cart = CartController(ApiClient());
  print(await CartView(cart).render(arguments));
}
