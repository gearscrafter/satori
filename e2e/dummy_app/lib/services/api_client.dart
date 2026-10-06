import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:async/async.dart';

import '../models/product.dart';

class ApiClient {
  final AsyncCache<List<Product>> _cache = AsyncCache.ephemeral();
  final HttpClient _http = HttpClient();

  Future<List<Product>> fetchProducts() => _cache.fetch(() async {
        final raw = jsonEncode([
          {'id': 'p1', 'title': 'Book', 'price': 12.5},
        ]);
        final list = jsonDecode(raw) as List<dynamic>;
        return list.map((m) => Product(m['id'] as String, m['title'] as String, m['price'] as double)).toList();
      });

  void close() => _http.close();
}
