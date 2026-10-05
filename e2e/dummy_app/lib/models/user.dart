import 'entity.dart';

class User extends Entity with Timestamped {
  final String name;
  final int age;

  User(String id, this.name, this.age) : super(id);

  bool get isAdult => age >= 18;
}
