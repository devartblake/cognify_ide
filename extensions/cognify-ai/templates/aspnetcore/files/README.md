# {{projectName}}

An ASP.NET Core minimal API created with Cognify IDE.

## In the Dev Container
The container restores the packages when it is created, with .NET telemetry turned off. Then:
- Test: `dotnet test`
- Run: `dotnet run --project src/{{dotnetName}} --urls http://0.0.0.0:5000`, then open http://localhost:5000

## On your machine
Requires the .NET 10 SDK. To turn off .NET telemetry, set `DOTNET_CLI_TELEMETRY_OPTOUT=1`.

```sh
dotnet test
dotnet run --project src/{{dotnetName}}
```
