import '../state/counter_cubit.dart';
import '../state/profile_controller.dart';
import '../state/session_notifier.dart';
import '../state/shims.dart';
import '../state/wishlist_store.dart';

/// Listens to four different kinds of state holder on purpose, to show the
/// state management map.
class CounterView {
  String render(BuildContext context, WidgetRef ref) {
    final cubit = context.read<CounterCubit>();
    final session = context.watch<SessionNotifier>();
    final profile = Get.find<ProfileController>();
    final wishlist = ref.watch(wishlistProvider);
    final builder = BlocBuilder<CounterCubit, int>(builder: (count) => '$count');
    return '${builder.builder(cubit.state)} ${session.user} ${profile.name} ${wishlist.length}';
  }
}
