/**
 * Arquivo: API/NETCORE/Repositories/DatabaseAccess/CupomAB.cs
 * Objetivo: grava e confere cupons de desconto separados por empresa.
 * Entradas esperadas: empresa do usuário logado, código e o subtotal da venda.
 */
using System.Globalization;
using HORUSPDV_API.Models.Requests;
using HORUSPDV_API.Repositories.DataAccess;

namespace HORUSPDV_API.Repositories.DatabaseAccess;

public class CupomAB(Connection connection)
{
    private static readonly CultureInfo Brazil = CultureInfo.GetCultureInfo("pt-BR");

    public async Task<List<CupomAD>> ListarAsync(string companyId)
    {
        await using var db = await connection.OpenConnectionAsync();
        await EnsureTableAsync(db);
        await using var command = new SqlCommand(
            """
            SELECT Id, CompanyId, Code, Description, Kind, Amount, Active, CreatedAt
            FROM Cupons
            WHERE CompanyId = @CompanyId
            ORDER BY Code;
            """,
            db);
        command.Parameters.AddWithValue("@CompanyId", companyId);
        await using var reader = await command.ExecuteReaderAsync();
        var rows = new List<CupomAD>();
        while (await reader.ReadAsync())
        {
            rows.Add(Map(reader));
        }

        return rows;
    }

    public async Task<CupomAD> CriarAsync(string companyId, CupomRequest request)
    {
        var cupom = Normalize(companyId, $"cpn-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}", request);
        await using var db = await connection.OpenConnectionAsync();
        await EnsureTableAsync(db);
        await EnsureCodeAvailableAsync(db, cupom, null);
        await using var command = new SqlCommand(
            """
            INSERT INTO Cupons (Id, CompanyId, Code, Description, Kind, Amount, Active, CreatedAt)
            VALUES (@Id, @CompanyId, @Code, @Description, @Kind, @Amount, @Active, now());
            """,
            db);
        AddParameters(command, cupom);
        await command.ExecuteNonQueryAsync();
        cupom.CreatedAt = DateTimeOffset.UtcNow;
        return cupom;
    }

    public async Task<CupomAD?> AtualizarAsync(string companyId, string id, CupomRequest request)
    {
        var cupom = Normalize(companyId, id, request);
        await using var db = await connection.OpenConnectionAsync();
        await EnsureTableAsync(db);
        await EnsureCodeAvailableAsync(db, cupom, id);
        await using var command = new SqlCommand(
            """
            UPDATE Cupons
               SET Code = @Code,
                   Description = @Description,
                   Kind = @Kind,
                   Amount = @Amount,
                   Active = @Active
             WHERE Id = @Id AND CompanyId = @CompanyId;
            """,
            db);
        AddParameters(command, cupom);
        var changed = await command.ExecuteNonQueryAsync();
        return changed == 0 ? null : cupom;
    }

    public async Task<bool> ExcluirAsync(string companyId, string id)
    {
        await using var db = await connection.OpenConnectionAsync();
        await EnsureTableAsync(db);
        await using var command = new SqlCommand(
            "DELETE FROM Cupons WHERE Id = @Id AND CompanyId = @CompanyId;",
            db);
        command.Parameters.AddWithValue("@Id", id);
        command.Parameters.AddWithValue("@CompanyId", companyId);
        return await command.ExecuteNonQueryAsync() > 0;
    }

    public async Task<CupomAplicadoAD> CalcularAsync(string companyId, string code, string subtotalText)
    {
        var normalizedCode = NormalizeCode(code);
        if (normalizedCode.Length < 2)
        {
            throw new InvalidOperationException("Informe o código do cupom.");
        }

        var subtotal = ParseMoney(subtotalText);
        if (subtotal <= 0)
        {
            throw new InvalidOperationException("Adicione itens no cupom antes de aplicar o desconto.");
        }

        await using var db = await connection.OpenConnectionAsync();
        await EnsureTableAsync(db);
        await using var command = new SqlCommand(
            """
            SELECT Id, CompanyId, Code, Description, Kind, Amount, Active, CreatedAt
            FROM Cupons
            WHERE CompanyId = @CompanyId AND Code = @Code;
            """,
            db);
        command.Parameters.AddWithValue("@CompanyId", companyId);
        command.Parameters.AddWithValue("@Code", normalizedCode);
        await using var reader = await command.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
        {
            throw new InvalidOperationException("Cupom não encontrado nesta empresa.");
        }

        var cupom = Map(reader);
        if (!cupom.Active)
        {
            throw new InvalidOperationException("Este cupom está inativo.");
        }

        var discount = DiscountOf(cupom, subtotal);
        var payable = Math.Max(0, subtotal - discount);
        return new CupomAplicadoAD
        {
            Code = cupom.Code,
            Description = cupom.Description,
            Kind = cupom.Kind,
            Amount = cupom.Amount,
            Discount = FormatMoney(discount),
            Payable = FormatMoney(payable)
        };
    }

    private static async Task EnsureCodeAvailableAsync(SqlConnection db, CupomAD cupom, string? ignoreId)
    {
        await using var command = new SqlCommand(
            """
            SELECT Id
            FROM Cupons
            WHERE CompanyId = @CompanyId AND Code = @Code AND (@IgnoreId IS NULL OR Id <> @IgnoreId);
            """,
            db);
        command.Parameters.AddWithValue("@CompanyId", cupom.CompanyId);
        command.Parameters.AddWithValue("@Code", cupom.Code);
        command.Parameters.AddWithValue("@IgnoreId", string.IsNullOrWhiteSpace(ignoreId) ? DBNull.Value : ignoreId);
        var existing = await command.ExecuteScalarAsync();
        if (existing is not null && existing is not DBNull)
        {
            throw new InvalidOperationException("Já existe um cupom com esse código nesta empresa.");
        }
    }

    private static CupomAD Normalize(string companyId, string id, CupomRequest request)
    {
        var code = NormalizeCode(request.Code);
        if (code.Length < 2 || code.Length > 40)
        {
            throw new InvalidOperationException("O código do cupom precisa ter entre 2 e 40 caracteres.");
        }

        var kind = request.Kind.Trim().ToLowerInvariant();
        if (kind is not ("percentual" or "fixo"))
        {
            throw new InvalidOperationException("Escolha porcentagem ou valor fixo.");
        }

        var amount = ParseMoney(request.Amount);
        if (kind == "percentual" && (amount <= 0 || amount > 100))
        {
            throw new InvalidOperationException("A porcentagem fica entre 0,01 e 100.");
        }

        if (kind == "fixo" && amount <= 0)
        {
            throw new InvalidOperationException("O valor fixo precisa ser maior que zero.");
        }

        return new CupomAD
        {
            Id = id,
            CompanyId = companyId,
            Code = code,
            Description = request.Description.Trim(),
            Kind = kind,
            Amount = FormatMoney(amount),
            Active = request.Active
        };
    }

    public static decimal DiscountOf(CupomAD cupom, decimal subtotal)
    {
        var amount = ParseMoney(cupom.Amount);
        var discount = cupom.Kind == "percentual"
            ? decimal.Round(subtotal * amount / 100m, 2, MidpointRounding.AwayFromZero)
            : amount;
        if (discount < 0) return 0;
        return discount > subtotal ? subtotal : discount;
    }

    public static string NormalizeCode(string code)
        => new string(code.Trim().ToUpperInvariant().Where(character => !char.IsWhiteSpace(character)).ToArray());

    public static decimal ParseMoney(string value)
    {
        var text = value.Replace("R$", "", StringComparison.OrdinalIgnoreCase).Trim();
        if (text.Contains(',') && text.Contains('.'))
        {
            text = text.Replace(".", "", StringComparison.Ordinal).Replace(',', '.');
        }
        else if (text.Contains(','))
        {
            text = text.Replace(',', '.');
        }

        return decimal.TryParse(text, NumberStyles.Number, CultureInfo.InvariantCulture, out var parsed)
            ? parsed
            : 0;
    }

    public static string FormatMoney(decimal value)
        => value.ToString("N2", Brazil);

    private static void AddParameters(SqlCommand command, CupomAD cupom)
    {
        command.Parameters.AddWithValue("@Id", cupom.Id);
        command.Parameters.AddWithValue("@CompanyId", cupom.CompanyId);
        command.Parameters.AddWithValue("@Code", cupom.Code);
        command.Parameters.AddWithValue("@Description", cupom.Description);
        command.Parameters.AddWithValue("@Kind", cupom.Kind);
        command.Parameters.AddWithValue("@Amount", cupom.Amount);
        command.Parameters.AddWithValue("@Active", cupom.Active);
    }

    private static CupomAD Map(SqlDataReader reader) => new()
    {
        Id = reader.GetString(reader.GetOrdinal("Id")),
        CompanyId = reader.GetString(reader.GetOrdinal("CompanyId")),
        Code = reader.GetString(reader.GetOrdinal("Code")),
        Description = reader.GetString(reader.GetOrdinal("Description")),
        Kind = reader.GetString(reader.GetOrdinal("Kind")),
        Amount = reader.GetString(reader.GetOrdinal("Amount")),
        Active = reader.GetBoolean(reader.GetOrdinal("Active")),
        CreatedAt = reader.GetDateTimeOffset(reader.GetOrdinal("CreatedAt"))
    };

    private static Task EnsureTableAsync(SqlConnection db)
    {
        _ = db;
        return Task.CompletedTask;
    }
}
