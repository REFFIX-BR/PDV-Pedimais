/**
 * Arquivo: API/NETCORE/Repositories/DataAccess/DevolucaoAD.cs
 * Objetivo: representa a devolução gravada e o resultado devolvido para a tela.
 * Entradas esperadas: valores lidos do SQL Server ou produzidos ao estornar a venda.
 */
namespace HORUSPDV_API.Repositories.DataAccess;

public class DevolucaoAD
{
    public string Id { get; set; } = string.Empty;
    public string SaleNumber { get; set; } = string.Empty;
    public string Kind { get; set; } = string.Empty;
    public string Reason { get; set; } = string.Empty;
    public string RefundAmount { get; set; } = "0,00";
    public string ChargeAmount { get; set; } = "0,00";
    public string PaymentType { get; set; } = string.Empty;
    public string OperatorName { get; set; } = string.Empty;
    public string CreatedAt { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public List<DevolucaoItemAD> Items { get; set; } = [];
}

public class DevolucaoItemAD
{
    public string Direction { get; set; } = string.Empty;
    public string ProductCode { get; set; } = string.Empty;
    public string ProductName { get; set; } = string.Empty;
    public decimal Quantity { get; set; }
    public string UnitPrice { get; set; } = "0,00";
    public string ItemTotal { get; set; } = "0,00";
}
