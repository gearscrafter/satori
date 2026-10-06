import '../models/cart.dart';
import '../models/order_data.dart';
import '../models/product.dart';
import '../models/user.dart';

/// Deliberately bloated, for the audit: it is very complex, reaches into the
/// attributes of other classes and keeps no state of its own, so it is a
/// "God Class" by the rule of Lanza and Marinescu (WMC >= 47, ATFD > 5, TCC < 1/3).
class CheckoutManager {
  String describeBuyer(User user) {
    if (user.age < 18) {
      return 'minor ${user.name}';
    } else if (user.age < 30 && user.name.isNotEmpty) {
      return 'young ${user.name}';
    } else if (user.age < 65 || user.name.length > 10) {
      return 'adult ${user.name}';
    }
    return user.id.isEmpty ? 'unknown' : user.id;
  }

  double priceOf(Product product, int quantity) {
    var total = product.price * quantity;
    if (quantity > 10 && product.price > 100) {
      total *= 0.8;
    } else if (quantity > 5 || product.price > 500) {
      total *= 0.9;
    }
    for (var i = 0; i < quantity; i++) {
      if (i % 2 == 0 && product.title.isNotEmpty) {
        total += 0.01;
      }
    }
    return total < 0 ? 0 : total;
  }

  String label(Product product) {
    if (product.title.isEmpty) {
      return 'untitled';
    }
    if (product.title.length > 20 && product.price > 50) {
      return product.title.substring(0, 20);
    }
    return product.price > 100 ? '${product.title}!' : product.title;
  }

  int countItems(Cart cart) {
    var count = 0;
    for (final item in cart.items) {
      if (item.price > 0 && item.title.isNotEmpty) {
        count++;
      } else if (item.price < 0 || item.title.length > 50) {
        count--;
      }
    }
    while (count > 100) {
      count -= 10;
    }
    return count;
  }

  bool canSubmit(OrderData order, User user) {
    if (order.id.isEmpty || user.id.isEmpty) {
      return false;
    }
    if (order.lines.isEmpty && user.age < 18) {
      return false;
    }
    for (final line in order.lines) {
      if (line.price <= 0 || line.id.isEmpty) {
        return false;
      }
    }
    return user.age >= 18 || order.lines.length < 3;
  }

  String summary(OrderData order, User user, Cart cart) {
    switch (order.lines.length) {
      case 0:
        return 'empty ${user.name}';
      case 1:
        return 'single ${order.id}';
      case 2:
        return 'pair ${order.id}';
      default:
        return cart.items.isEmpty ? 'big ${user.name}' : 'mixed ${cart.items.length}';
    }
  }

  String audit(OrderData order, Product product, User user) {
    try {
      if (order.lines.contains(product) && user.age > 17) {
        return 'ok ${product.id}';
      }
      return order.lines.isEmpty || product.price == 0 ? 'none' : 'skip ${user.id}';
    } catch (e) {
      return 'error';
    }
  }
}
