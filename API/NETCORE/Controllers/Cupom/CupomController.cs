/**
 * Arquivo: API/NETCORE/Controllers/Cupom/CupomController.cs
 * Objetivo: cadastra cupons da empresa e confere o código digitado no caixa.
 * Entradas esperadas: sessão autenticada e o cupom da própria empresa.
 */
using HORUSPDV_API.Models.Requests;
using HORUSPDV_API.Models.Response;
using HORUSPDV_API.Repositories.DatabaseAccess;
using HORUSPDV_API.Services.Security;
using Microsoft.AspNetCore.Mvc;

namespace HORUSPDV_API.Controllers.Cupom;

[ApiController]
[Route("api/[controller]")]
public class CupomController(CupomAB cupomAB) : ControllerBase
{
    [HttpGet]
    [HorusAuthorizeRoles("administrador")]
    public async Task<IActionResult> Listar()
    {
        var currentUser = GetCurrentUser();
        if (currentUser is null) return Unauthorized(new ApiResponse<object> { Success = false, Message = "Sessão não encontrada." });
        var rows = await cupomAB.ListarAsync(currentUser.CompanyId);
        return Ok(new ApiResponse<object>
        {
            Success = true,
            Message = "Cupons obtidos com sucesso.",
            Data = rows
        });
    }

    [HttpPost]
    [HorusAuthorizeRoles("administrador")]
    public async Task<IActionResult> Criar([FromBody] CupomRequest request)
    {
        var currentUser = GetCurrentUser();
        if (currentUser is null) return Unauthorized(new ApiResponse<object> { Success = false, Message = "Sessão não encontrada." });
        try
        {
            var created = await cupomAB.CriarAsync(currentUser.CompanyId, request);
            return StatusCode(StatusCodes.Status201Created, new ApiResponse<object>
            {
                Success = true,
                Message = "Cupom cadastrado.",
                Data = created
            });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new ApiResponse<object> { Success = false, Message = ex.Message });
        }
    }

    [HttpPut("{id}")]
    [HorusAuthorizeRoles("administrador")]
    public async Task<IActionResult> Atualizar(string id, [FromBody] CupomRequest request)
    {
        var currentUser = GetCurrentUser();
        if (currentUser is null) return Unauthorized(new ApiResponse<object> { Success = false, Message = "Sessão não encontrada." });
        try
        {
            var updated = await cupomAB.AtualizarAsync(currentUser.CompanyId, id, request);
            if (updated is null)
            {
                return NotFound(new ApiResponse<object> { Success = false, Message = "Cupom não encontrado." });
            }

            return Ok(new ApiResponse<object>
            {
                Success = true,
                Message = "Cupom atualizado.",
                Data = updated
            });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new ApiResponse<object> { Success = false, Message = ex.Message });
        }
    }

    [HttpDelete("{id}")]
    [HorusAuthorizeRoles("administrador")]
    public async Task<IActionResult> Excluir(string id)
    {
        var currentUser = GetCurrentUser();
        if (currentUser is null) return Unauthorized(new ApiResponse<object> { Success = false, Message = "Sessão não encontrada." });
        var removed = await cupomAB.ExcluirAsync(currentUser.CompanyId, id);
        if (!removed)
        {
            return NotFound(new ApiResponse<object> { Success = false, Message = "Cupom não encontrado." });
        }

        return Ok(new ApiResponse<object> { Success = true, Message = "Cupom excluído." });
    }

    [HttpPost("validar")]
    public async Task<IActionResult> Validar([FromBody] CupomValidarRequest request)
    {
        var currentUser = GetCurrentUser();
        if (currentUser is null) return Unauthorized(new ApiResponse<object> { Success = false, Message = "Sessão não encontrada." });
        try
        {
            var applied = await cupomAB.CalcularAsync(currentUser.CompanyId, request.Code, request.Subtotal);
            return Ok(new ApiResponse<object>
            {
                Success = true,
                Message = "Cupom aplicado.",
                Data = applied
            });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new ApiResponse<object> { Success = false, Message = ex.Message });
        }
    }

    private AuthenticatedUser? GetCurrentUser()
        => HttpContext.Items["CurrentUser"] as AuthenticatedUser;
}
