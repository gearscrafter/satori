abstract class Entity {
  final String id;
  Entity(this.id);
}

mixin Timestamped {
  DateTime createdAt = DateTime.now();
}
