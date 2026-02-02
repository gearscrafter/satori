class TestWidget {
  final String title;
  final int count;

  const TestWidget({
    required this.title,
    this.count = 0,
  });

  void build() {
    // Mock build method
    print('Building widget: $title');
  }
}

class ApiService {
  final String baseUrl;

  ApiService(this.baseUrl);

  Future<String> fetchData(String endpoint) async {
    await Future.delayed(Duration(milliseconds: 100));
    return 'Mock response from $baseUrl/$endpoint';
  }

  void validateInput(String input) {
    if (input.isEmpty) {
      throw ArgumentError('Input cannot be empty');
    }
  }
}

/// Sample model class
class User {
  final String name;
  final String email;
  final int age;

  User({
    required this.name,
    required this.email,
    required this.age,
  });

  Map<String, dynamic> toJson() => {
        'name': name,
        'email': email,
        'age': age,
      };

  factory User.fromJson(Map<String, dynamic> json) => User(
        name: json['name'],
        email: json['email'],
        age: json['age'],
      );
}

enum UserStatus { active, inactive, pending }

mixin Validation {
  bool isValidEmail(String email) {
    return email.contains('@');
  }
}
