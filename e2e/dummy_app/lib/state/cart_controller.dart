import 'dart:async';

import '../models/cart.dart';
import '../services/api_client.dart';
import '../utils/formatters.dart';

class CartController {
  final ApiClient api;
  final Cart cart = Cart();

  CartController(this.api);

  Future<void> load() async {
    final products = await api.fetchProducts();
    products.forEach(cart.add);
  }

  String summary() => 'Total ${money(cart.total)}';
}
