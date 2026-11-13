/**
 * Arquivo: API/NETCORE/Repositories/DatabaseAccess/DevolucaoAB.cs
 * Objetivo: devolve produto ao estoque, marca a venda e lança o dinheiro na gaveta de quem estorna.
 * Entradas esperadas: empresa, operador, caixa aberto e os itens que voltam ou saem na troca.
 */
using System.Globalization;
using HORUSPDV_API.Models.Requests;
using HORUSPDV_API.Repositories.DataAccess;

namespace HORUSPDV_API.Repositories.DatabaseAccess;

public class DevolucaoAB(Connection connection)
{
    private static readonly CultureInfo PtBr = new("pt-BR");

    public async Task<List<DevolucaoAD>> ListarAsync(string companyId)
    {
        await using var db = await connection.OpenConnectionAsync();
        await EnsureSchemaAsync(db);
        const string sql = """
            SELECT d.Id, d.SaleNumber, d.Kind, d.Reason, d.RefundAmount, d.ChargeAmount,
                   d.PaymentType, d.OperatorName, d.CreatedAt,
                   i.Direction, i.ProductCode, i.ProductName, i.Quantity, i.UnitPrice, i.ItemTotal
            FROM Devolucoes d
            LEFT JOIN DevolucaoItens i ON i.DevolucaoId = d.Id
            WHERE d.CompanyId = @CompanyId
            ORDER BY d.CreatedAt DESC, i.Direction, i.ProductName;
            """;
        await using var command = new SqlCommand(sql, db);
        command.Parameters.AddWithValue("@CompanyId", companyId);
        await using var reader = await command.ExecuteReaderAsync();
        var map = new Dictionary<string, DevolucaoAD>(StringComparer.Ordinal);
        var order = new List<string>();
        while (await reader.ReadAsync())
        {
            var id = ReadString(reader, "Id");
            if (!map.TryGetValue(id, out var row))
            {
                row = new DevolucaoAD
                {
                    Id = id,
                    SaleNumber = ReadString(reader, "SaleNumber"),
                    Kind = ReadString(reader, "Kind"),
                    Reason = ReadString(reader, "Reason"),
                    RefundAmount = ReadString(reader, "RefundAmount"),
                    ChargeAmount = ReadString(reader, "ChargeAmount"),
                    PaymentType = ReadString(reader, "PaymentType"),
                    OperatorName = ReadString(reader, "OperatorName"),
                    CreatedAt = reader.GetDateTimeOffset(reader.GetOrdinal("CreatedAt")).LocalDateTime.ToString("dd/MM/yyyy HH:mm:ss")
                };
                map[id] = row;
                order.Add(id);
            }

            if (!reader.IsDBNull(reader.GetOrdinal("ProductCode")))
            {
                row.Items.Add(new DevolucaoItemAD
                {
                    Direction = ReadString(reader, "Direction"),
                    ProductCode = ReadString(reader, "ProductCode"),
                    ProductName = ReadString(reader, "ProductName"),
                    Quantity = reader.GetDecimal(reader.GetOrdinal("Quantity")),
                    UnitPrice = ReadString(reader, "UnitPrice"),
                    ItemTotal = ReadString(reader, "ItemTotal")
                });
            }
        }

        return order.Select(id => map[id]).ToList();
    }

    public async Task<DevolucaoAD> RegistrarAsync(
        string companyId,
        string operatorId,
        string operatorName,
        string sessionId,
        decimal expectedCash,
        DevolucaoRequest request)
    {
        var reason = (request.Reason ?? "").Trim();
        if (reason.Length < 3)
        {
            throw new InvalidOperationException("Informe o motivo da devolução.");
        }

        if (reason.Length > 180)
        {
            throw new InvalidOperationException("O motivo deve ter no máximo 180 caracteres.");
        }

        var saleNumber = (request.SaleNumber ?? "").Trim();
        if (string.IsNullOrWhiteSpace(saleNumber))
        {
            throw new InvalidOperationException("Escolha a venda.");
        }

        var returns = (request.Returns ?? [])
            .Where(item => item.Quantity > 0 && !string.IsNullOrWhiteSpace(item.ProductCode))
            .GroupBy(item => item.ProductCode.Trim(), StringComparer.OrdinalIgnoreCase)
            .Select(group => new Line(group.Key, decimal.Round(group.Sum(item => item.Quantity), 3, MidpointRounding.AwayFromZero)))
            .ToList();
        var replacements = (request.Replacements ?? [])
            .Where(item => item.Quantity > 0 && !string.IsNullOrWhiteSpace(item.ProductCode))
            .GroupBy(item => item.ProductCode.Trim(), StringComparer.OrdinalIgnoreCase)
            .Select(group => new Line(group.Key, decimal.Round(group.Sum(item => item.Quantity), 3, MidpointRounding.AwayFromZero)))
            .ToList();

        if (returns.Count == 0)
        {
            throw new InvalidOperationException("Informe a quantidade que volta para o estoque.");
        }

        await using var db = await connection.OpenConnectionAsync();
        await EnsureSchemaAsync(db);
        await using var transaction = (SqlTransaction)await db.BeginTransactionAsync();

        try
        {
            var sale = await LoadSaleAsync(db, transaction, companyId, saleNumber);
            if (sale.Status.Equals("Estornada", StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException("Esta venda já foi estornada.");
            }

            var merchandiseRefund = 0m;
            var returnedLines = new List<SavedLine>();
            foreach (var line in returns)
            {
                var item = sale.Items.FirstOrDefault(row => row.ProductCode.Equals(line.Code, StringComparison.OrdinalIgnoreCase));
                if (item is null)
                {
                    throw new InvalidOperationException($"O produto {line.Code} não está nessa venda.");
                }

                var remaining = decimal.Round(item.Quantity - item.ReturnedQuantity, 3, MidpointRounding.AwayFromZero);
                if (line.Quantity - remaining > 0.0005m)
                {
                    throw new InvalidOperationException($"{item.ProductName} só tem {FormatQuantity(remaining)} para devolver.");
                }

                var share = sale.Gross <= 0 ? 0 : decimal.Round(sale.Total * (Price(item.UnitPrice) * line.Quantity) / sale.Gross, 2, MidpointRounding.AwayFromZero);
                merchandiseRefund += share;
                item.ReturnNow = line.Quantity;
                returnedLines.Add(new SavedLine("volta", item.ProductCode, item.ProductName, line.Quantity, item.UnitPrice, FormatMoney(share)));
            }

            var already = Price(sale.RefundedAmount);
            var refundRoom = Math.Max(0, sale.Total - already);
            if (merchandiseRefund > refundRoom)
            {
                merchandiseRefund = refundRoom;
            }

            var replacementLines = new List<SavedLine>();
            var replacementTotal = 0m;
            foreach (var line in replacements)
            {
                var product = await LoadProductAsync(db, transaction, companyId, line.Code);
                EnsureMeasure(product, line.Quantity);
                var lineTotal = decimal.Round(Price(product.SalePrice) * line.Quantity, 2, MidpointRounding.AwayFromZero);
                replacementTotal += lineTotal;
                replacementLines.Add(new SavedLine("sai", product.Code, product.Name, line.Quantity, product.SalePrice, FormatMoney(lineTotal)));
            }

            var net = decimal.Round(replacementTotal - merchandiseRefund, 2, MidpointRounding.AwayFromZero);
            var refundAmount = net < 0 ? decimal.Abs(net) : 0;
            var chargeAmount = net > 0 ? net : 0;
            var differencePayment = NormalizePayment(request.DifferencePayment);
            var cashPayment = chargeAmount > 0 ? differencePayment : sale.PaymentType;
            if (chargeAmount > 0 && string.IsNullOrWhiteSpace(differencePayment))
            {
                cashPayment = sale.PaymentType;
            }

            if (refundAmount > 0 && sale.PaymentType.Equals("dinheiro", StringComparison.OrdinalIgnoreCase) && refundAmount - expectedCash > 0.009m)
            {
                throw new InvalidOperationException($"A gaveta não tem o dinheiro da devolução (R$ {FormatMoney(expectedCash)}).");
            }

            var stockDelta = new Dictionary<string, decimal>(StringComparer.OrdinalIgnoreCase);
            foreach (var line in returnedLines)
            {
                stockDelta[line.ProductCode] = stockDelta.GetValueOrDefault(line.ProductCode) + line.Quantity;
            }

            foreach (var line in replacementLines)
            {
                stockDelta[line.ProductCode] = stockDelta.GetValueOrDefault(line.ProductCode) - line.Quantity;
            }

            foreach (var code in stockDelta.Keys.OrderBy(item => item, StringComparer.OrdinalIgnoreCase))
            {
                await ApplyStockAsync(db, transaction, companyId, code, stockDelta[code]);
            }

            foreach (var item in sale.Items.Where(row => row.ReturnNow > 0))
            {
                await using var updateItem = new SqlCommand(
                    """
                    UPDATE VendaItens
                       SET ReturnedQuantity = ReturnedQuantity + @Quantity
                     WHERE Id = @Id;
                    """,
                    db,
                    transaction);
                updateItem.Parameters.AddWithValue("@Quantity", item.ReturnNow);
                updateItem.Parameters.AddWithValue("@Id", item.Id);
                await updateItem.ExecuteNonQueryAsync();
                item.ReturnedQuantity += item.ReturnNow;
            }

            var fullyReturned = sale.Items.All(item => item.ReturnedQuantity + 0.0005m >= item.Quantity);
            var status = replacementLines.Count > 0
                ? "Troca"
                : fullyReturned ? "Estornada" : "Parcial";
            var nextRefunded = FormatMoney(already + refundAmount);

            await using (var updateSale = new SqlCommand(
                             """
                             UPDATE Vendas
                                SET Status = @Status,
                                    RefundedAmount = @RefundedAmount
                              WHERE Id = @Id;
                             """,
                             db,
                             transaction))
            {
                updateSale.Parameters.AddWithValue("@Status", status);
                updateSale.Parameters.AddWithValue("@RefundedAmount", nextRefunded);
                updateSale.Parameters.AddWithValue("@Id", sale.Id);
                await updateSale.ExecuteNonQueryAsync();
            }

            var returnId = "dv" + Guid.NewGuid().ToString("N");
            var now = DateTimeOffset.Now;
            await using (var insert = new SqlCommand(
                             """
                             INSERT INTO Devolucoes
                                 (Id, CompanyId, SaleNumber, Kind, Reason, RefundAmount, ChargeAmount, PaymentType, OperatorId, OperatorName, CreatedAt)
                             VALUES
                                 (@Id, @CompanyId, @SaleNumber, @Kind, @Reason, @RefundAmount, @ChargeAmount, @PaymentType, @OperatorId, @OperatorName, @CreatedAt);
                             """,
                             db,
                             transaction))
            {
                insert.Parameters.AddWithValue("@Id", returnId);
                insert.Parameters.AddWithValue("@CompanyId", companyId);
                insert.Parameters.AddWithValue("@SaleNumber", sale.SaleNumber);
                insert.Parameters.AddWithValue("@Kind", replacementLines.Count > 0 ? "troca" : "devolucao");
                insert.Parameters.AddWithValue("@Reason", reason);
                insert.Parameters.AddWithValue("@RefundAmount", FormatMoney(refundAmount));
                insert.Parameters.AddWithValue("@ChargeAmount", FormatMoney(chargeAmount));
                insert.Parameters.AddWithValue("@PaymentType", cashPayment);
                insert.Parameters.AddWithValue("@OperatorId", operatorId);
                insert.Parameters.AddWithValue("@OperatorName", operatorName);
                insert.Parameters.AddWithValue("@CreatedAt", now);
                await insert.ExecuteNonQueryAsync();
            }

            foreach (var line in returnedLines.Concat(replacementLines))
            {
                await using var insertItem = new SqlCommand(
                    """
                    INSERT INTO DevolucaoItens
                        (Id, DevolucaoId, Direction, ProductCode, ProductName, Quantity, UnitPrice, ItemTotal)
                    VALUES
                        (@Id, @DevolucaoId, @Direction, @ProductCode, @ProductName, @Quantity, @UnitPrice, @ItemTotal);
                    """,
                    db,
                    transaction);
                insertItem.Parameters.AddWithValue("@Id", "di" + Guid.NewGuid().ToString("N"));
                insertItem.Parameters.AddWithValue("@DevolucaoId", returnId);
                insertItem.Parameters.AddWithValue("@Direction", line.Direction);
                insertItem.Parameters.AddWithValue("@ProductCode", line.ProductCode);
                insertItem.Parameters.AddWithValue("@ProductName", line.ProductName);
                insertItem.Parameters.AddWithValue("@Quantity", line.Quantity);
                insertItem.Parameters.AddWithValue("@UnitPrice", line.UnitPrice);
                insertItem.Parameters.AddWithValue("@ItemTotal", line.ItemTotal);
                await insertItem.ExecuteNonQueryAsync();
            }

            if (refundAmount > 0 && sale.PaymentType.Equals("dinheiro", StringComparison.OrdinalIgnoreCase))
            {
                await InsertMovementAsync(db, transaction, companyId, sessionId, operatorId, operatorName, "devolucao", refundAmount, $"Devolução da venda {sale.SaleNumber}. {reason}", now);
            }

            if (chargeAmount > 0 && cashPayment.Equals("dinheiro", StringComparison.OrdinalIgnoreCase))
            {
                await InsertMovementAsync(db, transaction, companyId, sessionId, operatorId, operatorName, "troca", chargeAmount, $"Troca da venda {sale.SaleNumber}. {reason}", now);
            }

            await transaction.CommitAsync();
            return new DevolucaoAD
            {
                Id = returnId,
                SaleNumber = sale.SaleNumber,
                Kind = replacementLines.Count > 0 ? "troca" : "devolucao",
                Reason = reason,
                RefundAmount = FormatMoney(refundAmount),
                ChargeAmount = FormatMoney(chargeAmount),
                PaymentType = cashPayment,
                OperatorName = operatorName,
                CreatedAt = now.LocalDateTime.ToString("dd/MM/yyyy HH:mm:ss"),
                Status = status,
                Items = returnedLines.Concat(replacementLines).Select(line => new DevolucaoItemAD
                {
                    Direction = line.Direction,
                    ProductCode = line.ProductCode,
                    ProductName = line.ProductName,
                    Quantity = line.Quantity,
                    UnitPrice = line.UnitPrice,
                    ItemTotal = line.ItemTotal
                }).ToList()
            };
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }
    }

    private static async Task<SaleRow> LoadSaleAsync(SqlConnection db, SqlTransaction transaction, string companyId, string saleNumber)
    {
        SaleRow? sale = null;
        await using (var command = new SqlCommand(
                         """
                         SELECT Id, SaleNumber, PaymentType, TotalAmount, Status, RefundedAmount
                         FROM Vendas
                         WHERE CompanyId = @CompanyId AND SaleNumber = @SaleNumber
                         FOR UPDATE;
                         """,
                         db,
                         transaction))
        {
            command.Parameters.AddWithValue("@CompanyId", companyId);
            command.Parameters.AddWithValue("@SaleNumber", saleNumber);
            await using var reader = await command.ExecuteReaderAsync();
            if (await reader.ReadAsync())
            {
                sale = new SaleRow
                {
                    Id = ReadString(reader, "Id"),
                    SaleNumber = ReadString(reader, "SaleNumber"),
                    PaymentType = ReadString(reader, "PaymentType").Trim().ToLowerInvariant(),
                    TotalAmount = ReadString(reader, "TotalAmount"),
                    Status = string.IsNullOrWhiteSpace(ReadString(reader, "Status")) ? "Concluida" : ReadString(reader, "Status"),
                    RefundedAmount = ReadString(reader, "RefundedAmount")
                };
            }
        }

        if (sale is null)
        {
            throw new InvalidOperationException("Venda não encontrada.");
        }

        await using var items = new SqlCommand(
            """
            SELECT Id, ProductCode, ProductName, Quantity, ReturnedQuantity, UnitPrice, ItemTotal
            FROM VendaItens
            WHERE VendaId = @VendaId
            FOR UPDATE;
            """,
            db,
            transaction);
        items.Parameters.AddWithValue("@VendaId", sale.Id);
        await using var itemReader = await items.ExecuteReaderAsync();
        while (await itemReader.ReadAsync())
        {
            var row = new SaleItemRow
            {
                Id = ReadString(itemReader, "Id"),
                ProductCode = ReadString(itemReader, "ProductCode"),
                ProductName = ReadString(itemReader, "ProductName"),
                Quantity = itemReader.GetDecimal(itemReader.GetOrdinal("Quantity")),
                ReturnedQuantity = itemReader.GetDecimal(itemReader.GetOrdinal("ReturnedQuantity")),
                UnitPrice = ReadString(itemReader, "UnitPrice"),
                ItemTotal = ReadString(itemReader, "ItemTotal")
            };
            sale.Items.Add(row);
            sale.Gross += Price(row.UnitPrice) * row.Quantity;
        }

        sale.Total = Price(sale.TotalAmount);
        return sale;
    }

    private static async Task<ProductRow> LoadProductAsync(SqlConnection db, SqlTransaction transaction, string companyId, string productCode)
    {
        await using var command = new SqlCommand(
            """
            SELECT ProductCode, ProductName, ProductUnit, ProductSalePrice, ProductUnitPrice
            FROM Produtos
            WHERE CompanyId = @CompanyId AND ProductCode = @ProductCode
            FOR UPDATE;
            """,
            db,
            transaction);
        command.Parameters.AddWithValue("@CompanyId", companyId);
        command.Parameters.AddWithValue("@ProductCode", productCode);
        await using var reader = await command.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
        {
            throw new InvalidOperationException($"Produto {productCode} não encontrado.");
        }

        var salePrice = ReadString(reader, "ProductSalePrice");
        var cost = ReadString(reader, "ProductUnitPrice");
        return new ProductRow(
            ReadString(reader, "ProductCode"),
            ReadString(reader, "ProductName"),
            NormalizeUnit(ReadString(reader, "ProductUnit")),
            string.IsNullOrWhiteSpace(salePrice) ? cost : salePrice);
    }

    private static async Task ApplyStockAsync(
        SqlConnection db,
        SqlTransaction transaction,
        string companyId,
        string productCode,
        decimal delta)
    {
        if (delta == 0) return;

        string productId;
        string name;
        string unit;
        decimal current;
        string cost;
        await using (var select = new SqlCommand(
                         """
                         SELECT Id, ProductName, ProductUnit, ProductQnt, ProductUnitPrice
                         FROM Produtos
                         WHERE CompanyId = @CompanyId AND ProductCode = @ProductCode
                         FOR UPDATE;
                         """,
                         db,
                         transaction))
        {
            select.Parameters.AddWithValue("@CompanyId", companyId);
            select.Parameters.AddWithValue("@ProductCode", productCode);
            await using var reader = await select.ExecuteReaderAsync();
            if (!await reader.ReadAsync())
            {
                throw new InvalidOperationException($"Produto {productCode} não encontrado.");
            }

            productId = ReadString(reader, "Id");
            name = ReadString(reader, "ProductName");
            unit = NormalizeUnit(ReadString(reader, "ProductUnit"));
            current = ParseDecimal(ReadString(reader, "ProductQnt"));
            cost = ReadString(reader, "ProductUnitPrice");
        }

        if (delta < 0)
        {
            EnsureMeasure(new ProductRow(productCode, name, unit, "0,00"), decimal.Abs(delta));
        }
        else if (unit is "un" or "l" && delta != decimal.Truncate(delta))
        {
            throw new InvalidOperationException($"{name} volta em quantidade inteira.");
        }

        var next = decimal.Round(current + delta, 3, MidpointRounding.AwayFromZero);
        if (next < -0.0005m)
        {
            throw new InvalidOperationException($"Estoque insuficiente para {name}. Disponível: {FormatQuantity(current)}.");
        }

        if (next < 0) next = 0;
        await using var update = new SqlCommand(
            """
            UPDATE Produtos
               SET ProductQnt = @ProductQnt,
                   TotalPriceOnProduct = @TotalPriceOnProduct
             WHERE Id = @Id;
            """,
            db,
            transaction);
        update.Parameters.AddWithValue("@ProductQnt", FormatQuantity(next));
        update.Parameters.AddWithValue("@TotalPriceOnProduct", FormatMoney(Price(cost) * next));
        update.Parameters.AddWithValue("@Id", productId);
        await update.ExecuteNonQueryAsync();
    }

    private static async Task InsertMovementAsync(
        SqlConnection db,
        SqlTransaction transaction,
        string companyId,
        string sessionId,
        string operatorId,
        string operatorName,
        string movementType,
        decimal amount,
        string reason,
        DateTimeOffset createdAt)
    {
        if (string.IsNullOrWhiteSpace(sessionId))
        {
            throw new InvalidOperationException("Abra o seu caixa antes de devolver.");
        }

        var text = reason.Trim();
        if (text.Length > 180) text = text[..180];
        await using var command = new SqlCommand(
            """
            INSERT INTO CaixaMovimentos
                (Id, CompanyId, SessionId, MovementType, Amount, Reason, OperatorId, OperatorName, CreatedAt)
            VALUES
                (@Id, @CompanyId, @SessionId, @MovementType, @Amount, @Reason, @OperatorId, @OperatorName, @CreatedAt);
            """,
            db,
            transaction);
        command.Parameters.AddWithValue("@Id", "mv" + Guid.NewGuid().ToString("N"));
        command.Parameters.AddWithValue("@CompanyId", companyId);
        command.Parameters.AddWithValue("@SessionId", sessionId);
        command.Parameters.AddWithValue("@MovementType", movementType);
        command.Parameters.AddWithValue("@Amount", FormatMoney(amount));
        command.Parameters.AddWithValue("@Reason", text);
        command.Parameters.AddWithValue("@OperatorId", operatorId);
        command.Parameters.AddWithValue("@OperatorName", operatorName);
        command.Parameters.AddWithValue("@CreatedAt", createdAt);
        await command.ExecuteNonQueryAsync();
    }

    private static void EnsureMeasure(ProductRow product, decimal quantity)
    {
        if (quantity <= 0)
        {
            throw new InvalidOperationException("A quantidade precisa ser maior que zero.");
        }

        if (product.Unit is "un" or "l" && quantity != decimal.Truncate(quantity))
        {
            throw new InvalidOperationException($"{product.Name} sai em quantidade inteira.");
        }
    }

    private static string NormalizePayment(string value)
    {
        var payment = (value ?? "").Trim().ToLowerInvariant();
        return payment is "dinheiro" or "pix" or "debito" or "credito" ? payment : "";
    }

    private static string NormalizeUnit(string value)
    {
        var unit = value.Trim().ToLowerInvariant();
        return unit is "kg" or "l" ? unit : "un";
    }

    private static Task EnsureSchemaAsync(SqlConnection db)
    {
        _ = db;
        return Task.CompletedTask;
    }

    private static decimal Price(string value)
    {
        var normalized = value.Trim().Replace("R$", "", StringComparison.OrdinalIgnoreCase).Replace(".", "").Replace(",", ".");
        return decimal.TryParse(normalized, NumberStyles.Number, CultureInfo.InvariantCulture, out var parsed)
            ? decimal.Round(parsed, 2, MidpointRounding.AwayFromZero)
            : 0;
    }

    private static decimal ParseDecimal(string value)
    {
        var normalized = value.Trim().Replace(".", "").Replace(",", ".");
        return decimal.TryParse(normalized, NumberStyles.Number, CultureInfo.InvariantCulture, out var parsed) ? parsed : 0;
    }

    private static string FormatMoney(decimal value)
        => value.ToString("N2", PtBr);

    private static string FormatQuantity(decimal quantity)
        => quantity.ToString("0.###", PtBr);

    private static string ReadString(SqlDataReader reader, string name)
    {
        var ordinal = reader.GetOrdinal(name);
        return reader.IsDBNull(ordinal) ? string.Empty : reader.GetString(ordinal);
    }

    private sealed class Line(string code, decimal quantity)
    {
        public string Code { get; } = code;
        public decimal Quantity { get; } = quantity;
    }

    private sealed record SavedLine(string Direction, string ProductCode, string ProductName, decimal Quantity, string UnitPrice, string ItemTotal);

    private sealed record ProductRow(string Code, string Name, string Unit, string SalePrice);

    private sealed class SaleRow
    {
        public string Id { get; set; } = "";
        public string SaleNumber { get; set; } = "";
        public string PaymentType { get; set; } = "";
        public string TotalAmount { get; set; } = "0,00";
        public string Status { get; set; } = "Concluida";
        public string RefundedAmount { get; set; } = "0,00";
        public decimal Total { get; set; }
        public decimal Gross { get; set; }
        public List<SaleItemRow> Items { get; } = [];
    }

    private sealed class SaleItemRow
    {
        public string Id { get; set; } = "";
        public string ProductCode { get; set; } = "";
        public string ProductName { get; set; } = "";
        public decimal Quantity { get; set; }
        public decimal ReturnedQuantity { get; set; }
        public decimal ReturnNow { get; set; }
        public string UnitPrice { get; set; } = "0,00";
        public string ItemTotal { get; set; } = "0,00";
    }
}
