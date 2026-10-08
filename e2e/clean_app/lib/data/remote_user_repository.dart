import '../core/logger.dart';
import '../domain/user.dart';
import '../domain/user_repository.dart';

class RemoteUserRepository implements UserRepository {
  final Logger logger = Logger();

  @override
  Future<User?> find(String id) async {
    logger.log('find $id');
    return User(id, 'remote');
  }
}
