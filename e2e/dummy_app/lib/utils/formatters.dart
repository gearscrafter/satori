import 'dart:math' as math;

String money(double value) => '\$${(math.max(0, value)).toStringAsFixed(2)}';
