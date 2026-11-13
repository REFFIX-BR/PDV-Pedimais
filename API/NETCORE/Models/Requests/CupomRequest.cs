/**
 * Arquivo: API/NETCORE/Models/Requests/CupomRequest.cs
 * Objetivo: define a entrada do cadastro e da conferência de cupom.
 * Entradas esperadas: dados enviados pelo administrador e pelo caixa.
 */
namespace HORUSPDV_API.Models.Requests;

public class CupomRequest
{
    public string Code { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Kind { get; set; } = "percentual";
    public string Amount { get; set; } = string.Empty;
    public bool Active { get; set; } = true;
}

public class CupomValidarRequest
{
    public string Code { get; set; } = string.Empty;
    public string Subtotal { get; set; } = "0,00";
}
