/**
 * Arquivo: API/NETCORE/Services/Caixa/HorusCaixaService.cs
 * Objetivo: centraliza regras de negócio de abertura, fechamento e status de caixa antes do acesso ao banco ou resposta HTTP.
 * Entradas esperadas: recebe requisições já validadas pelos controladores e aplica consistência operacional do domínio.
 */
using System.Globalization;
using HORUSPDV_API.Models.Requests;
using HORUSPDV_API.Repositories.DataAccess;
using HORUSPDV_API.Repositories.DatabaseAccess;
using HORUSPDV_API.Services.Security;

namespace HORUSPDV_API.Services.Caixa;

public class HorusCaixaService(CaixaAB caixaAB)
{
    private static readonly TimeSpan MaxOpenPeriod = TimeSpan.FromHours(24);

    public CaixaStatusDto GetStatus(AuthenticatedUser currentUser, DateTimeOffset? reference = null)
        => BuildStatus(currentUser, reference ?? DateTimeOffset.Now);

    public CaixaStatusDto Abrir(AbrirCaixaRequest request, AuthenticatedUser currentUser)
    {
        var now = DateTimeOffset.Now;
        var openSession = ObterSessaoDoOperador(currentUser);
        if (openSession is not null)
        {
            var status = BuildStatus(currentUser, now);
            if (status.CanSell)
            {
                throw new InvalidOperationException("Você já tem um caixa aberto.");
            }

            throw new InvalidOperationException(
                "O seu caixa está fora do período. Feche ele antes de abrir outro.");
        }

        caixaAB.AbrirAsync(
                $"cx-{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}",
                currentUser.CompanyId,
                now,
                NormalizeMoney(request.OpeningAmount),
                currentUser.Id,
                currentUser.Name)
            .GetAwaiter()
            .GetResult();
        return BuildStatus(currentUser, now);
    }

    public CaixaStatusDto Fechar(FecharCaixaRequest request, AuthenticatedUser currentUser)
    {
        var now = DateTimeOffset.Now;
        var openSession = ObterSessaoDoOperador(currentUser);
        if (openSession is null)
        {
            throw new InvalidOperationException("Você não tem caixa aberto.");
        }

        caixaAB.FecharAsync(
                openSession.Id,
                currentUser.CompanyId,
                now,
                NormalizeMoney(request.ClosingAmount),
                currentUser.Id,
                currentUser.Name,
                request.Note.Trim())
            .GetAwaiter()
            .GetResult();
        return BuildStatus(currentUser, now);
    }

    public CaixaStatusDto LancarMovimento(string movementType, MovimentoCaixaRequest request, AuthenticatedUser currentUser)
    {
        if (request is null)
        {
            throw new InvalidOperationException("Informe o valor e o motivo.");
        }

        if (movementType is not ("sangria" or "suprimento"))
        {
            throw new InvalidOperationException("Tipo de movimentação inválido.");
        }

        var reason = (request.Reason ?? "").Trim();
        if (string.IsNullOrWhiteSpace(reason))
        {
            throw new InvalidOperationException("Informe o motivo.");
        }

        if (reason.Length > 180)
        {
            throw new InvalidOperationException("O motivo deve ter no máximo 180 caracteres.");
        }

        var amount = ParseMoney(request.Amount ?? "");
        if (amount <= 0)
        {
            throw new InvalidOperationException("Informe um valor maior que zero.");
        }

        var now = DateTimeOffset.Now;
        var status = BuildStatus(currentUser, now);
        if (status.CurrentSession is null || !status.CanSell)
        {
            throw new InvalidOperationException(
                string.IsNullOrWhiteSpace(status.BlockReason)
                    ? "Abra o seu caixa antes de lançar sangria ou suprimento."
                    : status.BlockReason);
        }

        if (movementType == "sangria")
        {
            var expected = ParseMoney(status.CurrentSession.ExpectedCash);
            if (amount > expected)
            {
                throw new InvalidOperationException(
                    $"A sangria é maior que o dinheiro em caixa (R$ {FormatMoney(expected)}).");
            }
        }

        var movementId = "mov-" + Guid.NewGuid().ToString("N");
        caixaAB.InserirMovimentoAsync(
                movementId,
                currentUser.CompanyId,
                status.CurrentSession.Id,
                movementType,
                FormatMoney(amount),
                reason,
                currentUser.Id,
                currentUser.Name,
                now)
            .GetAwaiter()
            .GetResult();

        return BuildStatus(currentUser, now);
    }

    public CaixaPainelDto Painel(AuthenticatedUser currentUser)
    {
        if (!currentUser.Role.Contains("admin", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("Só o administrador acompanha os caixas da loja.");
        }

        var now = DateTimeOffset.Now;
        var openSessions = caixaAB.ListarSessoesAsync(currentUser.CompanyId)
            .GetAwaiter()
            .GetResult()
            .Where(item => item.ClosedAt is null)
            .ToList();
        var drawers = new List<CaixaPainelItemDto>();

        foreach (var session in openSessions)
        {
            var drawer = BuildDrawer(session, currentUser.CompanyId);
            var lines = caixaAB.ListarItensDaSessaoAsync(
                    currentUser.CompanyId,
                    session.OpenedAt,
                    session.ClosedAt,
                    session.OperatorName)
                .GetAwaiter()
                .GetResult();
            var salesTotal = drawer.Sales.Sum(item => ParseMoney(item.TotalAmount));
            var profit = lines.Sum(item =>
            {
                var sold = item.SoldQuantity <= 0 ? item.Quantity : item.SoldQuantity;
                var revenue = sold <= 0 ? 0 : ParseMoney(item.ItemTotal) * item.Quantity / sold;
                return revenue - ParseMoney(item.UnitCost) * item.Quantity;
            });
            drawers.Add(new CaixaPainelItemDto
            {
                OperatorName = session.OperatorName,
                OpenedAt = session.OpenedAt.ToString("o"),
                ElapsedMinutes = Math.Max(0, (int)Math.Floor((now - session.OpenedAt).TotalMinutes)),
                OpeningAmount = session.OpeningAmount,
                SalesCount = drawer.Sales.Count,
                SalesTotal = FormatMoney(salesTotal),
                CashSalesTotal = FormatMoney(SumPayments(drawer.Sales, "dinheiro")),
                PixTotal = FormatMoney(SumPayments(drawer.Sales, "pix")),
                DebitTotal = FormatMoney(SumPayments(drawer.Sales, "debito")),
                CreditTotal = FormatMoney(SumPayments(drawer.Sales, "credito")),
                ProfitTotal = FormatMoney(profit),
                SupplyTotal = FormatMoney(drawer.Supplies),
                WithdrawalTotal = FormatMoney(drawer.Withdrawals),
                ExpectedCash = FormatMoney(drawer.Expected)
            });
        }

        return new CaixaPainelDto
        {
            OpenCount = drawers.Count,
            SalesTotal = FormatMoney(drawers.Sum(item => ParseMoney(item.SalesTotal))),
            ProfitTotal = FormatMoney(drawers.Sum(item => ParseMoney(item.ProfitTotal))),
            WithdrawalTotal = FormatMoney(drawers.Sum(item => ParseMoney(item.WithdrawalTotal))),
            SupplyTotal = FormatMoney(drawers.Sum(item => ParseMoney(item.SupplyTotal))),
            Drawers = drawers
        };
    }

    public void EnsureVendaPermitida(AuthenticatedUser currentUser)
    {
        var status = BuildStatus(currentUser, DateTimeOffset.Now);
        if (status.CanSell) return;

        throw new InvalidOperationException(status.BlockReason);
    }

    private CaixaSessionAD? ObterSessaoDoOperador(AuthenticatedUser currentUser)
        => caixaAB.ListarSessoesAsync(currentUser.CompanyId)
            .GetAwaiter()
            .GetResult()
            .FirstOrDefault(item => item.ClosedAt is null && item.OperatorId == currentUser.Id);

    private CaixaStatusDto BuildStatus(AuthenticatedUser currentUser, DateTimeOffset now)
    {
        var sessions = caixaAB.ListarSessoesAsync(currentUser.CompanyId).GetAwaiter().GetResult();
        var mine = sessions.Where(item => item.OperatorId == currentUser.Id).ToList();
        var openSession = mine.FirstOrDefault(item => item.ClosedAt is null);
        var lastSession = openSession ?? mine.FirstOrDefault();
        var canSell = false;
        var blockReason = "Abra o seu caixa antes de iniciar vendas.";
        var state = "fechado";

        if (openSession is not null)
        {
            var openedToday = openSession.OpenedAt.Date == now.Date;
            var withinPeriod = now - openSession.OpenedAt <= MaxOpenPeriod;

            // Cada operador vende só com o próprio caixa, aberto no dia e por até 24 horas.
            if (openedToday && withinPeriod)
            {
                canSell = true;
                blockReason = "";
                state = "aberto";
            }
            else
            {
                state = "expirado";
                blockReason = !openedToday
                    ? "O seu caixa é de outro dia. Feche e abra o caixa de hoje."
                    : "O seu caixa passou de 24 horas. Feche e abra de novo.";
            }
        }

        var seesStoreHistory = currentUser.Role.Contains("admin", StringComparison.OrdinalIgnoreCase);
        var historySource = seesStoreHistory ? sessions : mine;
        var currentDto = openSession is null ? null : ToDto(openSession, now, BuildDrawer(openSession, currentUser.CompanyId));

        return new CaixaStatusDto
        {
            State = state,
            CanSell = canSell,
            BlockReason = blockReason,
            ServerNow = now.ToString("o"),
            HistoryScope = seesStoreHistory ? "loja" : "meu",
            CurrentSession = currentDto,
            LastSession = lastSession is null ? null : ToDto(lastSession, now),
            History = historySource.Take(12).Select(item => ToDto(item, now)).ToList(),
            OpenDrawers = sessions
                .Where(item => item.ClosedAt is null && item.OperatorId != currentUser.Id)
                .Select(item => new CaixaAbertoDto
                {
                    OperatorName = item.OperatorName,
                    OpenedAt = item.OpenedAt.ToString("o"),
                    ElapsedMinutes = Math.Max(0, (int)Math.Floor((now - item.OpenedAt).TotalMinutes))
                })
                .ToList()
        };
    }

    private CaixaDrawerSummary BuildDrawer(CaixaSessionAD session, string companyId)
    {
        var movements = caixaAB.ListarMovimentosAsync(session.Id).GetAwaiter().GetResult();
        var sessionSales = caixaAB.ListarVendasDaSessaoAsync(companyId, session.OpenedAt, session.ClosedAt, session.OperatorName).GetAwaiter().GetResult();
        var opening = ParseMoney(session.OpeningAmount);
        var supplies = movements.Where(item => item.MovementType == "suprimento").Sum(item => ParseMoney(item.Amount));
        var sangria = movements.Where(item => item.MovementType == "sangria").Sum(item => ParseMoney(item.Amount));
        var returns = movements.Where(item => item.MovementType == "devolucao").Sum(item => ParseMoney(item.Amount));
        var exchanges = movements.Where(item => item.MovementType == "troca").Sum(item => ParseMoney(item.Amount));
        var withdrawals = sangria + returns;
        var sales = sessionSales
            .Where(item => item.PaymentType.Equals("dinheiro", StringComparison.OrdinalIgnoreCase))
            .Sum(item => ParseMoney(item.TotalAmount));
        var expected = opening + supplies + sales + exchanges - withdrawals;

        return new CaixaDrawerSummary(supplies, withdrawals, sales, exchanges, expected, movements, sessionSales);
    }

    private static CaixaSessionDto ToDto(CaixaSessionAD source, DateTimeOffset now, CaixaDrawerSummary? drawer = null)
    {
        var closedAt = source.ClosedAt;
        var elapsed = (closedAt ?? now) - source.OpenedAt;

        return new CaixaSessionDto
        {
            Id = source.Id,
            Status = closedAt is null ? "Aberto" : "Fechado",
            OpenedAt = source.OpenedAt.ToString("o"),
            ClosedAt = closedAt?.ToString("o"),
            OpeningAmount = source.OpeningAmount,
            ClosingAmount = source.ClosingAmount,
            OperatorName = source.OperatorName,
            ClosedByName = source.ClosedByName,
            Note = source.Note,
            ElapsedMinutes = Math.Max(0, (int)Math.Floor(elapsed.TotalMinutes)),
            SupplyTotal = FormatMoney(drawer?.Supplies ?? 0),
            WithdrawalTotal = FormatMoney(drawer?.Withdrawals ?? 0),
            CashSalesTotal = FormatMoney(drawer?.CashSales ?? 0),
            ExchangeTotal = FormatMoney(drawer?.Exchanges ?? 0),
            ExpectedCash = FormatMoney(drawer?.Expected ?? ParseMoney(source.OpeningAmount)),
            Movements = drawer?.Movements.Select(item => new CaixaMovimentoDto
            {
                Id = item.Id,
                Type = item.MovementType,
                Amount = item.Amount,
                Reason = item.Reason,
                OperatorName = item.OperatorName,
                CreatedAt = item.CreatedAt.ToString("o")
            }).ToList() ?? [],
            Sales = drawer?.Sales.Select(item => new CaixaVendaDto
            {
                SaleNumber = item.SaleNumber,
                PaymentType = item.PaymentType,
                TotalAmount = item.TotalAmount,
                OperatorName = item.OperatorName,
                SaleDate = item.SaleDate.ToString("o")
            }).ToList() ?? []
        };
    }

    private static decimal ParseMoney(string value)
    {
        var normalized = value.Trim().Replace("R$", "", StringComparison.OrdinalIgnoreCase).Replace(".", "").Replace(",", ".");
        return decimal.TryParse(normalized, NumberStyles.Number, CultureInfo.InvariantCulture, out var parsed)
            ? decimal.Round(parsed, 2, MidpointRounding.AwayFromZero)
            : 0;
    }

    private static string FormatMoney(decimal value)
        => value.ToString("N2", new CultureInfo("pt-BR"));

    private static decimal SumPayments(List<CaixaVendaAD> sales, string paymentType)
        => sales
            .Where(item => item.PaymentType.Equals(paymentType, StringComparison.OrdinalIgnoreCase))
            .Sum(item => ParseMoney(item.TotalAmount));

    private static string NormalizeMoney(string value)
    {
        var trimmed = value.Trim();
        return string.IsNullOrWhiteSpace(trimmed) ? "0,00" : trimmed;
    }
}

public class CaixaStatusDto
{
    public string State { get; set; } = "fechado";
    public bool CanSell { get; set; }
    public string BlockReason { get; set; } = "";
    public string ServerNow { get; set; } = "";
    public string HistoryScope { get; set; } = "meu";
    public CaixaSessionDto? CurrentSession { get; set; }
    public CaixaSessionDto? LastSession { get; set; }
    public List<CaixaSessionDto> History { get; set; } = [];
    public List<CaixaAbertoDto> OpenDrawers { get; set; } = [];
}

public class CaixaPainelDto
{
    public int OpenCount { get; set; }
    public string SalesTotal { get; set; } = "0,00";
    public string ProfitTotal { get; set; } = "0,00";
    public string WithdrawalTotal { get; set; } = "0,00";
    public string SupplyTotal { get; set; } = "0,00";
    public List<CaixaPainelItemDto> Drawers { get; set; } = [];
}

public class CaixaPainelItemDto
{
    public string OperatorName { get; set; } = "";
    public string OpenedAt { get; set; } = "";
    public int ElapsedMinutes { get; set; }
    public string OpeningAmount { get; set; } = "0,00";
    public int SalesCount { get; set; }
    public string SalesTotal { get; set; } = "0,00";
    public string CashSalesTotal { get; set; } = "0,00";
    public string PixTotal { get; set; } = "0,00";
    public string DebitTotal { get; set; } = "0,00";
    public string CreditTotal { get; set; } = "0,00";
    public string ProfitTotal { get; set; } = "0,00";
    public string SupplyTotal { get; set; } = "0,00";
    public string WithdrawalTotal { get; set; } = "0,00";
    public string ExpectedCash { get; set; } = "0,00";
}

public class CaixaAbertoDto
{
    public string OperatorName { get; set; } = "";
    public string OpenedAt { get; set; } = "";
    public int ElapsedMinutes { get; set; }
}

public class CaixaSessionDto
{
    public string Id { get; set; } = "";
    public string Status { get; set; } = "";
    public string OpenedAt { get; set; } = "";
    public string? ClosedAt { get; set; }
    public string OpeningAmount { get; set; } = "0,00";
    public string ClosingAmount { get; set; } = "0,00";
    public string OperatorName { get; set; } = "";
    public string ClosedByName { get; set; } = "";
    public string Note { get; set; } = "";
    public int ElapsedMinutes { get; set; }
    public string SupplyTotal { get; set; } = "0,00";
    public string WithdrawalTotal { get; set; } = "0,00";
    public string CashSalesTotal { get; set; } = "0,00";
    public string ExchangeTotal { get; set; } = "0,00";
    public string ExpectedCash { get; set; } = "0,00";
    public List<CaixaMovimentoDto> Movements { get; set; } = [];
    public List<CaixaVendaDto> Sales { get; set; } = [];
}

public class CaixaVendaDto
{
    public string SaleNumber { get; set; } = "";
    public string PaymentType { get; set; } = "";
    public string TotalAmount { get; set; } = "0,00";
    public string OperatorName { get; set; } = "";
    public string SaleDate { get; set; } = "";
}

public class CaixaMovimentoDto
{
    public string Id { get; set; } = "";
    public string Type { get; set; } = "";
    public string Amount { get; set; } = "0,00";
    public string Reason { get; set; } = "";
    public string OperatorName { get; set; } = "";
    public string CreatedAt { get; set; } = "";
}

sealed class CaixaDrawerSummary
{
    public CaixaDrawerSummary(
        decimal supplies,
        decimal withdrawals,
        decimal cashSales,
        decimal exchanges,
        decimal expected,
        List<CaixaMovimentoAD> movements,
        List<CaixaVendaAD> sales)
    {
        Supplies = supplies;
        Withdrawals = withdrawals;
        CashSales = cashSales;
        Exchanges = exchanges;
        Expected = expected;
        Movements = movements;
        Sales = sales;
    }

    public decimal Supplies { get; }
    public decimal Withdrawals { get; }
    public decimal CashSales { get; }
    public decimal Exchanges { get; }
    public decimal Expected { get; }
    public List<CaixaMovimentoAD> Movements { get; }
    public List<CaixaVendaAD> Sales { get; }
}
