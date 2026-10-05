import '../models/entity.dart';

abstract class Repository<T extends Entity> {
  Future<T?> findById(String id);
  Future<void> save(T item);
}
