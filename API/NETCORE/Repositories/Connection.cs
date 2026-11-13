/**
 * Arquivo: API/NETCORE/Repositories/Connection.cs
 * Objetivo: centraliza a criação de conexões PostgreSQL usadas pelos repositórios da API.
 * Entradas esperadas: espera configuração de connection string válida para abrir o banco pdv_pedimais.
 */
using Npgsql;

namespace HORUSPDV_API.Repositories;

public sealed class Connection(IConfiguration configuration)
{
    public string ConnectionString { get; } = ResolveConnectionString(configuration);

    public async Task<NpgsqlConnection> OpenConnectionAsync(
        CancellationToken cancellationToken = default,
        string? database = null)
    {
        var connection = new NpgsqlConnection(BuildConnectionString(database));
        await connection.OpenAsync(cancellationToken);
        return connection;
    }

    public NpgsqlConnection OpenConnection(string? database = null)
    {
        var connection = new NpgsqlConnection(BuildConnectionString(database));
        connection.Open();
        return connection;
    }

    public string BuildConnectionString(string? database = null)
    {
        var builder = new NpgsqlConnectionStringBuilder(ConnectionString);
        if (!string.IsNullOrWhiteSpace(database))
        {
            builder.Database = database;
        }

        return builder.ConnectionString;
    }

    private static string ResolveConnectionString(IConfiguration configuration)
    {
        var connectionString =
            FirstNonEmpty(
                configuration.GetConnectionString("HorusPdv"),
                configuration.GetConnectionString("DefaultConnection"),
                Environment.GetEnvironmentVariable("SQLCONNSTR_HorusPdv"),
                Environment.GetEnvironmentVariable("SQLCONNSTR_DefaultConnection"),
                Environment.GetEnvironmentVariable("HORUSPDV_CONNECTION_STRING"));

        if (string.IsNullOrWhiteSpace(connectionString))
        {
            throw new InvalidOperationException(
                "Connection string não configurada. Defina ConnectionStrings:HorusPdv ou HORUSPDV_CONNECTION_STRING.");
        }

        return connectionString;
    }

    private static string? FirstNonEmpty(params string?[] values)
        => values.FirstOrDefault(value => !string.IsNullOrWhiteSpace(value));
}
