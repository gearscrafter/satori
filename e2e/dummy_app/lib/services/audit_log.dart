class AuditLog {
  final List<String> entries = [];

  void save(String entry) {
    entries.add(entry);
  }
}
