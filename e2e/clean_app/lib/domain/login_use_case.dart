import 'user.dart';
import 'user_repository.dart';

class LoginUseCase {
  final UserRepository repository;

  LoginUseCase(this.repository);

  Future<User?> call(String id) => repository.find(id);
}
