/**
 * Arquivo: API/NETCORE/Middlewares/HorusAuthMiddleware.cs
 * Objetivo: intercepta requisições HTTP para aplicar regra transversal de autenticação, cadastro, recuperação de senha e sessões.
 * Entradas esperadas: recebe HttpContext do pipeline ASP.NET Core e decide se a requisição segue para o próximo middleware.
 */
using HORUSPDV_API.Models.Response;
using HORUSPDV_API.Repositories.DatabaseAccess;
using HORUSPDV_API.Services.Security;

namespace HORUSPDV_API.Middlewares;

public class HorusAuthMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context, HorusJwtService jwtService, HorusSecurityStore securityStore)
    {
        if (ShouldSkipAuth(context))
        {
            await next(context);
            return;
        }

        var token = ResolveToken(context);

        var authenticatedUser = string.IsNullOrWhiteSpace(token) ? null : jwtService.ValidateToken(token);
        var activeUser = authenticatedUser is not null && securityStore.IsSessionActive(authenticatedUser.SessionId)
            ? securityStore.GetActiveUser(authenticatedUser.Id)
            : null;
        if (authenticatedUser is null || activeUser is null)
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            await context.Response.WriteAsJsonAsync(new ApiResponse<object>
            {
                Success = false,
                Message = "Sessao expirada ou token invalido."
            });
            return;
        }

        context.Items["CurrentUser"] = authenticatedUser;
        if (!AllowsExpiredPlan(context) && activeUser.PlanBlocked)
        {
            context.Response.StatusCode = StatusCodes.Status402PaymentRequired;
            await context.Response.WriteAsJsonAsync(new ApiResponse<object>
            {
                Success = false,
                Message = "O plano desta empresa venceu. Fale com a REFFIX para renovar.",
                Details = "plan-expired"
            });
            return;
        }

        var rolePolicy = context.GetEndpoint()?.Metadata.GetMetadata<HorusAuthorizeRolesAttribute>();
        if (rolePolicy is not null && rolePolicy.Roles.Count > 0 && !rolePolicy.Roles.Contains(authenticatedUser.Role))
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            await context.Response.WriteAsJsonAsync(new ApiResponse<object>
            {
                Success = false,
                Message = "Usuário sem permissão para esta ação."
            });
            return;
        }

        await next(context);
    }

    private static bool AllowsExpiredPlan(HttpContext context)
    {
        var path = context.Request.Path.Value ?? "";
        if (path.StartsWith("/api/Auth/logout", StringComparison.OrdinalIgnoreCase)) return true;
        if (path.StartsWith("/api/Auth/refresh", StringComparison.OrdinalIgnoreCase)) return true;
        return path.StartsWith("/api/Auth/me", StringComparison.OrdinalIgnoreCase) &&
               HttpMethods.IsGet(context.Request.Method);
    }

    private static bool ShouldSkipAuth(HttpContext context)
    {
        if (HttpMethods.IsOptions(context.Request.Method)) return true;

        var path = context.Request.Path.Value ?? "";
        return path.StartsWith("/atualizacoes", StringComparison.OrdinalIgnoreCase) ||
               path.StartsWith("/api/Auth/login", StringComparison.OrdinalIgnoreCase) ||
               path.StartsWith("/api/Auth/refresh", StringComparison.OrdinalIgnoreCase) ||
               path.StartsWith("/api/Auth/forgot-password", StringComparison.OrdinalIgnoreCase) ||
               path.StartsWith("/api/Auth/reset-password", StringComparison.OrdinalIgnoreCase) ||
               path.StartsWith("/api/Auth/register", StringComparison.OrdinalIgnoreCase) ||
               (context.RequestServices.GetRequiredService<IWebHostEnvironment>().IsDevelopment() &&
                path.StartsWith("/swagger", StringComparison.OrdinalIgnoreCase));
    }

    private static string ResolveToken(HttpContext context)
    {
        var cookieToken = context.Request.Cookies[HorusJwtService.AuthCookieName];
        if (!string.IsNullOrWhiteSpace(cookieToken))
        {
            return cookieToken;
        }

        var authHeader = context.Request.Headers.Authorization.ToString();
        var parts = authHeader.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        return parts.Length == 2 && parts[0].Equals("Bearer", StringComparison.Ordinal)
            ? parts[1]
            : "";
    }
}
