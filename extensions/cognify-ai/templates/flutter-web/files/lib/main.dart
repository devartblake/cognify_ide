import 'package:flutter/material.dart';

void main() {
  runApp(const App());
}

class App extends StatelessWidget {
  const App({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: '{{projectName}}',
      theme: ThemeData(colorSchemeSeed: Colors.indigo),
      home: const CounterPage(title: '{{projectName}}'),
    );
  }
}

class CounterPage extends StatefulWidget {
  const CounterPage({super.key, required this.title});

  final String title;

  @override
  State<CounterPage> createState() => _CounterPageState();
}

class _CounterPageState extends State<CounterPage> {
  int _count = 0;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      body: Center(child: Text('Clicked $_count times')),
      floatingActionButton: FloatingActionButton(
        onPressed: () => setState(() => _count++),
        tooltip: 'Increment',
        child: const Icon(Icons.add),
      ),
    );
  }
}
