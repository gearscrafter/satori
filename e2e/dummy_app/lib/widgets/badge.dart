import '../models/product.dart';
import '../utils/formatters.dart';

class PriceBadge {
  final Product product;

  PriceBadge(this.product);

  String label() => '${product.title} ${money(product.price)}';
}
