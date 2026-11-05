var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

app.MapGet("/", () => new { Message = "Hello from {{projectName}}" });
app.MapGet("/health", () => new { Status = "ok" });

app.Run();

/// <summary>Lets the integration tests start the app.</summary>
public partial class Program { }
