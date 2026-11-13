namespace HORUSPDV_API.Repositories.DatabaseAccess;

internal static class NpgsqlReaderExtensions
{
    public static DateTimeOffset GetDateTimeOffset(this SqlDataReader reader, int ordinal)
        => reader.GetFieldValue<DateTimeOffset>(ordinal);
}
