import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize?: number;

  /** Alias for `pageSize` (contract compatibility). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit?: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  query?: string;
}

export function resolvePagination(query: PaginationQueryDto): {
  page: number;
  pageSize: number;
} {
  const page = query.page ?? DEFAULT_PAGE;
  const pageSize = Math.min(
    query.limit ?? query.pageSize ?? DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
  );
  return { page, pageSize };
}
