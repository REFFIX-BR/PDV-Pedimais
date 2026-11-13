/**
 * Arquivo: API/NETCORE/Controllers/Devolucoes/DevolucoesController.cs
 * Objetivo: lista devoluções e estorna uma venda já paga, devolvendo o produto ao estoque.
 * Entradas esperadas: sessão autenticada, caixa aberto e os itens da venda.
 */
using System.Globalization;
using HORUSPDV_API.Models.Requests;
using HORUSPDV_API.Models.Response;
using HORUSPDV_API.Repositories.DatabaseAccess;
using HORUSPDV_API.Services.Caixa;
using HORUSPDV_API.Services.Security;
using Microsoft.AspNetCore.Mvc;

namespace HORUSPDV_API.Controllers.Devolucoes;

[ApiController]
[Route("api/[controller]")]
public class DevolucoesController(DevolucaoAB devolucaoAB, HorusCaixaService caixaService) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Listar()
    {
        var currentUser = GetCurrentUser();
        if (currentUser is null) return Unauthorized(new ApiResponse<object> { Success = false, Message = "Sessão não encontrada." });
        var rows = await devolucaoAB.ListarAsync(currentUser.CompanyId);
        return Ok(new ApiResponse<object>
        {
            Success = true,
            Message = "Devoluções obtidas com sucesso.",
            Data = rows
        });
    }

    [HttpPost]
    public async Task<IActionResult> Registrar([FromBody] DevolucaoRequest request)
    {
        var currentUser = GetCurrentUser();
        if (currentUser is null) return Unauthorized(new ApiResponse<object> { Success = false, Message = "Sessão não encontrada." });

        try
        {
            var status = caixaService.GetStatus(currentUser);
            if (!status.CanSell || status.CurrentSession is null)
            {
                return BadRequest(new ApiResponse<object>
                {
                    Success = false,
                    Message = string.IsNullOrWhiteSpace(status.BlockReason)
                        ? "Abra o seu caixa antes de devolver."
                        : status.BlockReason
                });
            }

            var expected = ParseMoney(status.CurrentSession.ExpectedCash);
            var result = await devolucaoAB.RegistrarAsync(
                currentUser.CompanyId,
                currentUser.Id,
                string.IsNullOrWhiteSpace(currentUser.Name) ? "Operador" : currentUser.Name.Trim(),
                status.CurrentSession.Id,
                expected,
                request);
            return StatusCode(StatusCodes.Status201Created, new ApiResponse<object>
            {
                Success = true,
                Message = result.Kind == "troca" ? "Troca registrada. O estoque foi atualizado." : "Devolução registrada. O produto voltou ao estoque e a venda foi estornada.",
                Data = result
            });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new ApiResponse<object> { Success = false, Message = ex.Message });
        }
    }

    private static decimal ParseMoney(string value)
    {
        var normalized = value.Trim().Replace("R$", "", StringComparison.OrdinalIgnoreCase).Replace(".", "").Replace(",", ".");
        return decimal.TryParse(normalized, NumberStyles.Number, CultureInfo.InvariantCulture, out var parsed) ? parsed : 0;
    }

    private AuthenticatedUser? GetCurrentUser()
        => HttpContext.Items["CurrentUser"] as AuthenticatedUser;
}
