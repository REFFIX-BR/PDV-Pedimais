/**
 * Arquivo: API/NETCORE/Repositories/HorusDatabaseInitializer.cs
 * Objetivo: cria o banco pdv_pedimais e aplica o schema PostgreSQL na subida da API.
 * Entradas esperadas: espera PostgreSQL acessível pela connection string configurada.
 */
using Npgsql;

namespace HORUSPDV_API.Repositories;

public static class HorusDatabaseInitializer
{
    public static async Task InitializeAsync(IServiceProvider services)
    {
        using var scope = services.CreateScope();
        var connection = scope.ServiceProvider.GetRequiredService<Connection>();
        var logger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>()
            .CreateLogger("HorusDatabaseInitializer");
        var scriptPath = Path.Combine(AppContext.BaseDirectory, "DataBase", "pdv_pedimais.sql");

        if (!File.Exists(scriptPath))
        {
            scriptPath = Path.Combine(Directory.GetCurrentDirectory(), "DataBase", "pdv_pedimais.sql");
        }

        if (!File.Exists(scriptPath))
        {
            logger.LogWarning("Script SQL não encontrado em DataBase/pdv_pedimais.sql. Inicialização do banco ignorada.");
            return;
        }

        var builder = new NpgsqlConnectionStringBuilder(connection.ConnectionString);
        var database = string.IsNullOrWhiteSpace(builder.Database) ? "pdv_pedimais" : builder.Database;
        builder.Database = "postgres";

        try
        {
            await using var admin = new NpgsqlConnection(builder.ConnectionString);
            await admin.OpenAsync();
            await using var exists = new NpgsqlCommand("SELECT 1 FROM pg_database WHERE datname = @Name;", admin);
            exists.Parameters.AddWithValue("@Name", database);
            if (await exists.ExecuteScalarAsync() is null)
            {
                var quoted = "\"" + database.Replace("\"", "\"\"") + "\"";
                await using var create = new NpgsqlCommand($"CREATE DATABASE {quoted};", admin);
                await create.ExecuteNonQueryAsync();
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Não foi possível conferir o banco {Database} pelo catálogo postgres. O schema segue na conexão configurada.", database);
        }

        var script = await File.ReadAllTextAsync(scriptPath);
        await using var db = await connection.OpenConnectionAsync(database: database);
        await using var command = new NpgsqlCommand(script, db)
        {
            CommandTimeout = 180
        };
        await command.ExecuteNonQueryAsync();
        logger.LogInformation("Schema PostgreSQL DataBase/pdv_pedimais.sql aplicado em {Database}.", database);
    }
}
