# {{projectName}}

A Flutter web app created with Cognify IDE. Only the web target is set up.

## In the Dev Container
The container image includes the Flutter SDK, with analytics turned off, and fetches the packages when it is created. Then:
- Test: `flutter test`
- Build: `flutter build web`
- Run: `flutter run -d web-server --web-hostname 0.0.0.0 --web-port 8080`, then open http://localhost:8080

## On your machine
Requires Flutter 3.24 or later (which includes Dart).

```sh
flutter pub get
flutter test
flutter run -d chrome
```
