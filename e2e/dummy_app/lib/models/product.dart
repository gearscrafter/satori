import '../services/api_client.dart';
import 'cart.dart';
import 'entity.dart';

class Product extends Entity {
  final String title;
  final double price;

  Product(super.id, this.title, this.price);

  Product discounted(double percent) => Product(id, title, price * (1 - percent / 100));

  // Deliberate smells for the audit: a model that reaches up into a service
  // (layer violation) and a circular dependency with Cart and ApiClient.
  bool fitsIn(Cart cart) => cart.items.length < 10;

  Future<Product> refreshed(ApiClient api) async => (await api.fetchProducts()).firstWhere((p) => p.id == id);
}
