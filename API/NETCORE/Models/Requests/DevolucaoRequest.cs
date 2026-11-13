/**
 * Arquivo: API/NETCORE/Models/Requests/DevolucaoRequest.cs
 * Objetivo: define o que volta para o estoque e, na troca, o que o cliente leva no lugar.
 * Entradas esperadas: número da venda, motivo, quantidades devolvidas e produtos da troca.
 */
namespace HORUSPDV_API.Models.Requests;

public class DevolucaoRequest
{
    public string SaleNumber { get; set; } = string.Empty;
    public string Reason { get; set; } = string.Empty;
    public string DifferencePayment { get; set; } = string.Empty;
    public List<DevolucaoItemRequest> Returns { get; set; } = [];
    public List<DevolucaoItemRequest> Replacements { get; set; } = [];
}

public class DevolucaoItemRequest
{
    public string ProductCode { get; set; } = string.Empty;
    public decimal Quantity { get; set; }
}
