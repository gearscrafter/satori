import '../data/remote_user_repository.dart';
import '../domain/login_use_case.dart';

class LoginPage {
  final LoginUseCase login;

  LoginPage(this.login);

  Future<String> render() async {
    final user = await login('1');
    return user?.name ?? 'nobody';
  }

  // Deliberate violation of satori.json: presentation must not reach into data.
  Future<void> shortcut() async {
    final repository = RemoteUserRepository();
    await repository.find('1');
  }
}
