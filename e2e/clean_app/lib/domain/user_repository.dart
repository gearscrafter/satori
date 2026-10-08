import 'user.dart';

abstract class UserRepository {
  Future<User?> find(String id);
}
