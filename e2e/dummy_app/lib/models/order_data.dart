import '../services/api_client.dart';
import 'product.dart';

enum OrderStatus { pending, paid }

class OrderData {
  final String id;
  final List<Product> lines;
  OrderStatus status = OrderStatus.pending;

  OrderData(this.id, this.lines);

  int count() => lines.length;

  double sum() => lines.fold(0, (acc, p) => acc + p.price);

  // Deliberate smell for the audit: a model that reaches up into a service.
  Future<void> submit(ApiClient api) async => api.fetchProducts();
}
