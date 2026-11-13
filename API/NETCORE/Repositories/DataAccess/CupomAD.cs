/**
 * Arquivo: API/NETCORE/Repositories/DataAccess/CupomAD.cs
 * Objetivo: representa um cupom de desconto da empresa no caixa.
 * Entradas esperadas: dados lidos ou gravados na tabela Cupons.
 */
namespace HORUSPDV_API.Repositories.DataAccess;

public class CupomAD
{
    public string Id { get; set; } = string.Empty;
    public string CompanyId { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Kind { get; set; } = "percentual";
    public string Amount { get; set; } = "0,00";
    public bool Active { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; }
}

public class CupomAplicadoAD
{
    public string Code { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Kind { get; set; } = string.Empty;
    public string Amount { get; set; } = string.Empty;
    public string Discount { get; set; } = "0,00";
    public string Payable { get; set; } = "0,00";
}
