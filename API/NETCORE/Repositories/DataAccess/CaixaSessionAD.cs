/**
 * Arquivo: API/NETCORE/Repositories/DataAccess/CaixaSessionAD.cs
 * Objetivo: representa estrutura de dados de abertura, fechamento e status de caixa retornada pelo acesso ao banco.
 * Entradas esperadas: recebe valores lidos do SQL Server e alimenta serviços/repositórios superiores.
 */
namespace HORUSPDV_API.Repositories.DataAccess;

public class CaixaSessionAD
{
    public string Id { get; set; } = string.Empty;
    public DateTimeOffset OpenedAt { get; set; }
    public DateTimeOffset? ClosedAt { get; set; }
    public string OpeningAmount { get; set; } = "0,00";
    public string ClosingAmount { get; set; } = "0,00";
    public string OperatorId { get; set; } = string.Empty;
    public string OperatorName { get; set; } = string.Empty;
    public string ClosedByName { get; set; } = string.Empty;
    public string Note { get; set; } = string.Empty;
}

public class CaixaVendaAD
{
    public string SaleNumber { get; set; } = string.Empty;
    public string PaymentType { get; set; } = string.Empty;
    public string TotalAmount { get; set; } = "0,00";
    public string RefundedAmount { get; set; } = "0,00";
    public string OperatorName { get; set; } = string.Empty;
    public DateTimeOffset SaleDate { get; set; }
}

public class CaixaItemLucroAD
{
    public decimal Quantity { get; set; }
    public decimal SoldQuantity { get; set; }
    public string ItemTotal { get; set; } = "0,00";
    public string UnitCost { get; set; } = "0,00";
}

public class CaixaMovimentoAD
{
    public string Id { get; set; } = string.Empty;
    public string SessionId { get; set; } = string.Empty;
    public string MovementType { get; set; } = string.Empty;
    public string Amount { get; set; } = "0,00";
    public string Reason { get; set; } = string.Empty;
    public string OperatorName { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }
}
