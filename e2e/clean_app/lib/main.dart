import 'data/remote_user_repository.dart';
import 'domain/login_use_case.dart';
import 'presentation/login_page.dart';

Future<void> main() async {
  final page = LoginPage(LoginUseCase(RemoteUserRepository()));
  print(await page.render());
}
