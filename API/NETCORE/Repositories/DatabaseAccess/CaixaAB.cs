/**
 * Arquivo: API/NETCORE/Repositories/DatabaseAccess/CaixaAB.cs
 * Objetivo: concentra comandos SQL e persistência de abertura, fechamento e status de caixa.
 * Entradas esperadas: recebe conexão configurada, parâmetros normalizados e executa leitura/escrita no SQL Server.
 */
using HORUSPDV_API.Repositories.DataAccess;
using Microsoft.Data.SqlClient;

namespace HORUSPDV_API.Repositories.DatabaseAccess;

public class CaixaAB(Connection connection)
{
    public async Task<List<CaixaSessionAD>> ListarSessoesAsync(string companyId)
    {
        await using var db = await connection.OpenConnectionAsync();
        await using var command = new SqlCommand(
            """
            SELECT Id, OpenedAt, ClosedAt, OpeningAmount, ClosingAmount, OperatorId, OperatorName, ClosedByName, Note
            FROM CaixaSessoes
            WHERE CompanyId = @CompanyId
            ORDER BY OpenedAt DESC;
            """,
            db);
        command.Parameters.AddWithValue("@CompanyId", companyId);
        await using var reader = await command.ExecuteReaderAsync();
        var rows = new List<CaixaSessionAD>();
        while (await reader.ReadAsync())
        {
            rows.Add(Map(reader));
        }

        return rows;
    }

    public async Task<CaixaSessionAD?> ObterSessaoAbertaAsync(string companyId)
        => (await ListarSessoesAsync(companyId)).FirstOrDefault(item => item.ClosedAt is null);

    public async Task AbrirAsync(
        string id,
        string companyId,
        DateTimeOffset openedAt,
        string openingAmount,
        string operatorId,
        string operatorName)
    {
        await using var db = await connection.OpenConnectionAsync();
        await using var command = new SqlCommand(
            """
            INSERT INTO CaixaSessoes
                (Id, CompanyId, OpenedAt, OpeningAmount, ClosingAmount, OperatorId, OperatorName, ClosedById, ClosedByName, Note)
            VALUES
                (@Id, @CompanyId, @OpenedAt, @OpeningAmount, N'0,00', @OperatorId, @OperatorName, N'', N'', N'');
            """,
            db);
        command.Parameters.AddWithValue("@Id", id);
        command.Parameters.AddWithValue("@CompanyId", companyId);
        command.Parameters.AddWithValue("@OpenedAt", openedAt);
        command.Parameters.AddWithValue("@OpeningAmount", openingAmount);
        command.Parameters.AddWithValue("@OperatorId", operatorId);
        command.Parameters.AddWithValue("@OperatorName", operatorName);
        await command.ExecuteNonQueryAsync();
    }

    public async Task FecharAsync(
        string id,
        string companyId,
        DateTimeOffset closedAt,
        string closingAmount,
        string closedById,
        string closedByName,
        string note)
    {
        await using var db = await connection.OpenConnectionAsync();
        await using var command = new SqlCommand(
            """
            UPDATE CaixaSessoes
               SET ClosedAt = @ClosedAt,
                   ClosingAmount = @ClosingAmount,
                   ClosedById = @ClosedById,
                   ClosedByName = @ClosedByName,
                   Note = @Note
             WHERE Id = @Id AND CompanyId = @CompanyId;
            """,
            db);
        command.Parameters.AddWithValue("@ClosedAt", closedAt);
        command.Parameters.AddWithValue("@CompanyId", companyId);
        command.Parameters.AddWithValue("@ClosingAmount", closingAmount);
        command.Parameters.AddWithValue("@ClosedById", closedById);
        command.Parameters.AddWithValue("@ClosedByName", closedByName);
        command.Parameters.AddWithValue("@Note", note);
        command.Parameters.AddWithValue("@Id", id);
        await command.ExecuteNonQueryAsync();
    }

    public async Task<List<CaixaMovimentoAD>> ListarMovimentosAsync(string sessionId)
    {
        await using var db = await connection.OpenConnectionAsync();
        await using var command = new SqlCommand(
            """
            SELECT Id, SessionId, MovementType, Amount, Reason, OperatorName, CreatedAt
            FROM CaixaMovimentos
            WHERE SessionId = @SessionId
            ORDER BY CreatedAt DESC;
            """,
            db);
        command.Parameters.AddWithValue("@SessionId", sessionId);
        await using var reader = await command.ExecuteReaderAsync();
        var rows = new List<CaixaMovimentoAD>();
        while (await reader.ReadAsync())
        {
            rows.Add(new CaixaMovimentoAD
            {
                Id = ReadString(reader, "Id"),
                SessionId = ReadString(reader, "SessionId"),
                MovementType = ReadString(reader, "MovementType"),
                Amount = ReadString(reader, "Amount"),
                Reason = ReadString(reader, "Reason"),
                OperatorName = ReadString(reader, "OperatorName"),
                CreatedAt = reader.GetDateTimeOffset(reader.GetOrdinal("CreatedAt"))
            });
        }

        return rows;
    }

    public async Task<List<CaixaVendaAD>> ListarVendasDaSessaoAsync(
        string companyId,
        DateTimeOffset openedAt,
        DateTimeOffset? closedAt,
        string operatorName)
    {
        await using var db = await connection.OpenConnectionAsync();
        await using var command = new SqlCommand(
            """
            SELECT SaleNumber, PaymentType, TotalAmount, RefundedAmount, OperatorName, SaleDate
            FROM Vendas
            WHERE CompanyId = @CompanyId
              AND SaleDate >= @OpenedAt
              AND (@ClosedAt IS NULL OR SaleDate <= @ClosedAt)
              AND OperatorName = @OperatorName
            ORDER BY SaleDate DESC;
            """,
            db);
        command.Parameters.AddWithValue("@CompanyId", companyId);
        command.Parameters.AddWithValue("@OpenedAt", openedAt);
        command.Parameters.AddWithValue("@ClosedAt", (object?)closedAt ?? DBNull.Value);
        command.Parameters.AddWithValue("@OperatorName", operatorName);
        await using var reader = await command.ExecuteReaderAsync();
        var rows = new List<CaixaVendaAD>();
        while (await reader.ReadAsync())
        {
            rows.Add(new CaixaVendaAD
            {
                SaleNumber = ReadString(reader, "SaleNumber"),
                PaymentType = ReadString(reader, "PaymentType"),
                TotalAmount = ReadString(reader, "TotalAmount"),
                RefundedAmount = ReadString(reader, "RefundedAmount"),
                OperatorName = ReadString(reader, "OperatorName"),
                SaleDate = reader.GetDateTimeOffset(reader.GetOrdinal("SaleDate"))
            });
        }

        return rows;
    }

    public async Task<List<CaixaItemLucroAD>> ListarItensDaSessaoAsync(
        string companyId,
        DateTimeOffset openedAt,
        DateTimeOffset? closedAt,
        string operatorName)
    {
        await using var db = await connection.OpenConnectionAsync();
        await using var command = new SqlCommand(
            """
            SELECT i.Quantity - ISNULL(i.ReturnedQuantity, 0) AS Quantity, i.Quantity AS SoldQuantity, i.ItemTotal, p.ProductUnitPrice
            FROM Vendas v
            INNER JOIN VendaItens i ON i.VendaId = v.Id
            LEFT JOIN Produtos p ON p.CompanyId = v.CompanyId AND p.ProductCode = i.ProductCode
            WHERE v.CompanyId = @CompanyId
              AND v.OperatorName = @OperatorName
              AND v.SaleDate >= @OpenedAt
              AND (@ClosedAt IS NULL OR v.SaleDate <= @ClosedAt);
            """,
            db);
        command.Parameters.AddWithValue("@CompanyId", companyId);
        command.Parameters.AddWithValue("@OpenedAt", openedAt);
        command.Parameters.AddWithValue("@ClosedAt", (object?)closedAt ?? DBNull.Value);
        command.Parameters.AddWithValue("@OperatorName", operatorName);
        await using var reader = await command.ExecuteReaderAsync();
        var rows = new List<CaixaItemLucroAD>();
        while (await reader.ReadAsync())
        {
            rows.Add(new CaixaItemLucroAD
            {
                Quantity = reader.GetDecimal(reader.GetOrdinal("Quantity")),
                SoldQuantity = reader.GetDecimal(reader.GetOrdinal("SoldQuantity")),
                ItemTotal = ReadString(reader, "ItemTotal"),
                UnitCost = ReadString(reader, "ProductUnitPrice")
            });
        }

        return rows;
    }

    public async Task<List<string>> ListarVendasDinheiroAsync(string companyId, DateTimeOffset openedAt)
    {
        await using var db = await connection.OpenConnectionAsync();
        await using var command = new SqlCommand(
            """
            SELECT TotalAmount
            FROM Vendas
            WHERE CompanyId = @CompanyId
              AND PaymentType = N'dinheiro'
              AND SaleDate >= @OpenedAt;
            """,
            db);
        command.Parameters.AddWithValue("@CompanyId", companyId);
        command.Parameters.AddWithValue("@OpenedAt", openedAt);
        await using var reader = await command.ExecuteReaderAsync();
        var totals = new List<string>();
        while (await reader.ReadAsync())
        {
            totals.Add(ReadString(reader, "TotalAmount"));
        }

        return totals;
    }

    public async Task InserirMovimentoAsync(
        string id,
        string companyId,
        string sessionId,
        string movementType,
        string amount,
        string reason,
        string operatorId,
        string operatorName,
        DateTimeOffset createdAt)
    {
        await using var db = await connection.OpenConnectionAsync();
        await using var command = new SqlCommand(
            """
            INSERT INTO CaixaMovimentos
                (Id, CompanyId, SessionId, MovementType, Amount, Reason, OperatorId, OperatorName, CreatedAt)
            VALUES
                (@Id, @CompanyId, @SessionId, @MovementType, @Amount, @Reason, @OperatorId, @OperatorName, @CreatedAt);
            """,
            db);
        command.Parameters.AddWithValue("@Id", id);
        command.Parameters.AddWithValue("@CompanyId", companyId);
        command.Parameters.AddWithValue("@SessionId", sessionId);
        command.Parameters.AddWithValue("@MovementType", movementType);
        command.Parameters.AddWithValue("@Amount", amount);
        command.Parameters.AddWithValue("@Reason", reason);
        command.Parameters.AddWithValue("@OperatorId", operatorId);
        command.Parameters.AddWithValue("@OperatorName", operatorName);
        command.Parameters.AddWithValue("@CreatedAt", createdAt);
        await command.ExecuteNonQueryAsync();
    }

    private static CaixaSessionAD Map(SqlDataReader reader) => new()
    {
        Id = ReadString(reader, "Id"),
        OpenedAt = reader.GetDateTimeOffset(reader.GetOrdinal("OpenedAt")),
        ClosedAt = reader.IsDBNull(reader.GetOrdinal("ClosedAt"))
            ? null
            : reader.GetDateTimeOffset(reader.GetOrdinal("ClosedAt")),
        OpeningAmount = ReadString(reader, "OpeningAmount"),
        ClosingAmount = ReadString(reader, "ClosingAmount"),
        OperatorId = ReadString(reader, "OperatorId"),
        OperatorName = ReadString(reader, "OperatorName"),
        ClosedByName = ReadString(reader, "ClosedByName"),
        Note = ReadString(reader, "Note")
    };

    private static string ReadString(SqlDataReader reader, string name)
    {
        var ordinal = reader.GetOrdinal(name);
        return reader.IsDBNull(ordinal) ? string.Empty : reader.GetString(ordinal);
    }
}
