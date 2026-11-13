/**
 * Arquivo: API/NETCORE/Controllers/Empresa/ManutencaoController.cs
 * Objetivo: publica o status de manutenção da empresa para o painel e para o caixa.
 * Entradas esperadas: a leitura vale para qualquer usuário da empresa; a gravação vale só para o administrador.
 */
using HORUSPDV_API.Models.Requests;
using HORUSPDV_API.Models.Response;
using HORUSPDV_API.Repositories.DatabaseAccess;
using HORUSPDV_API.Services.Security;
using Microsoft.AspNetCore.Mvc;

namespace HORUSPDV_API.Controllers.Empresa;

[ApiController]
[Route("api/[controller]")]
public class ManutencaoController(EmpresaAB empresaAB) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Obter()
    {
        var currentUser = GetCurrentUser();
        if (currentUser is null)
        {
            return Unauthorized(new ApiResponse<ManutencaoRequest> { Success = false, Message = "Sessão não encontrada." });
        }

        var (status, message) = await empresaAB.ObterManutencaoAsync(currentUser.CompanyId);
        return Ok(new ApiResponse<ManutencaoRequest>
        {
            Success = true,
            Message = "Status de manutenção obtido com sucesso.",
            Data = new ManutencaoRequest { Status = status, Message = message }
        });
    }

    [HttpPut]
    [HorusAuthorizeRoles("administrador")]
    public async Task<IActionResult> Atualizar([FromBody] ManutencaoRequest request)
    {
        var currentUser = GetCurrentUser();
        if (currentUser is null)
        {
            return Unauthorized(new ApiResponse<ManutencaoRequest> { Success = false, Message = "Sessão não encontrada." });
        }

        var (status, message) = await empresaAB.DefinirManutencaoAsync(
            currentUser.CompanyId,
            request.Status,
            request.Message);
        return Ok(new ApiResponse<ManutencaoRequest>
        {
            Success = true,
            Message = status == "manutencao"
                ? "Manutenção publicada no caixa."
                : "Caixa liberado.",
            Data = new ManutencaoRequest { Status = status, Message = message }
        });
    }

    private AuthenticatedUser? GetCurrentUser()
        => HttpContext.Items["CurrentUser"] as AuthenticatedUser;
}
