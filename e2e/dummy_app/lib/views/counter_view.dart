import '../state/counter_cubit.dart';
import '../state/profile_controller.dart';
import '../state/session_notifier.dart';
import '../state/shims.dart';

/// Listens to three different kinds of state holder on purpose, to show the
/// state management map.
class CounterView {
  String render(BuildContext context) {
    final cubit = context.read<CounterCubit>();
    final session = context.watch<SessionNotifier>();
    final profile = Get.find<ProfileController>();
    final builder = BlocBuilder<CounterCubit, int>(builder: (count) => '$count');
    return '${builder.builder(cubit.state)} ${session.user} ${profile.name}';
  }
}
