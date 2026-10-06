import 'package:collection/collection.dart';

import 'product.dart';

class Cart {
  final List<Product> items = [];

  void add(Product product) => items.add(product);

  double get total => items.map((p) => p.price).sum;

  Product? cheapest() => items.sorted((a, b) => a.price.compareTo(b.price)).firstOrNull;
}
