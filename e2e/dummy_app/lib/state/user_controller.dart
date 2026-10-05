import '../models/user.dart';
import '../services/user_repository.dart';

class UserController {
  final UserRepository repository;
  User? current;

  UserController(this.repository);

  Future<void> register(String id, String name, int age) async {
    final user = User(id, name, age);
    await repository.save(user);
    current = user;
  }

  Future<bool> isCurrentAdult() async {
    final user = current ?? await repository.findById('missing');
    return user?.isAdult ?? false;
  }
}
