/**
 * Arquivo: API/NETCORE/Models/Requests/ManutencaoRequest.cs
 * Objetivo: define o status de manutenção que o painel publica e o caixa lê.
 * Entradas esperadas: status operando ou manutencao, e uma mensagem curta.
 */
namespace HORUSPDV_API.Models.Requests;

public class ManutencaoRequest
{
    public string Status { get; set; } = "operando";
    public string Message { get; set; } = string.Empty;
}
