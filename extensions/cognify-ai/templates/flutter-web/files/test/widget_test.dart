import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:{{dartPackage}}/main.dart';

void main() {
  testWidgets('the counter increments', (tester) async {
    await tester.pumpWidget(const App());
    expect(find.text('Clicked 0 times'), findsOneWidget);
    await tester.tap(find.byIcon(Icons.add));
    await tester.pump();
    expect(find.text('Clicked 1 times'), findsOneWidget);
  });
}
