import 'package:args/args.dart';

import '../state/cart_controller.dart';

class CartView {
  final CartController controller;

  CartView(this.controller);

  Future<String> render(List<String> arguments) async {
    final parser = ArgParser()..addFlag('verbose');
    final verbose = parser.parse(arguments)['verbose'] as bool;
    await controller.load();
    return verbose ? controller.cart.items.join(',') : controller.summary();
  }
}
