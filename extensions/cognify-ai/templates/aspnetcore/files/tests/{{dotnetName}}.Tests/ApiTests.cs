using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace {{dotnetName}}.Tests;

public class ApiTests(WebApplicationFactory<Program> factory) : IClassFixture<WebApplicationFactory<Program>>
{
	[Fact]
	public async Task HealthReportsOk()
	{
		var client = factory.CreateClient();
		var health = await client.GetFromJsonAsync<Health>("/health", TestContext.Current.CancellationToken);
		Assert.Equal("ok", health?.Status);
	}

	private sealed record Health(string Status);
}
