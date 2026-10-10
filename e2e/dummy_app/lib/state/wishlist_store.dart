import 'shims.dart';

class WishlistStore extends StateNotifier<List<String>> {
  WishlistStore() : super(const []);

  void add(String id) => state = [...state, id];
}

final wishlistProvider = StateNotifierProvider<WishlistStore, List<String>>(() => WishlistStore());
