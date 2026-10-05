import '../models/user.dart';
import 'repository.dart';

class UserRepository implements Repository<User> {
  final Map<String, User> _store = {};

  @override
  Future<User?> findById(String id) async => _store[id];

  @override
  Future<void> save(User item) async {
    _store[item.id] = item;
  }
}
