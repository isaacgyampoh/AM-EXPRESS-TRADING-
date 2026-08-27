/**
 * Shared shapes for repository contracts.
 *
 * Every list operation is paginated and filtered *at the source*. There is no
 * `findAll()` anywhere in this system: the POS runs on a phone over a mobile
 * network, and a repository that quietly returns ten thousand rows is a
 * performance bug waiting for the business to grow into it.
 */

export interface PageRequest {
  /** 1-based. */
  readonly page: number;
  readonly pageSize: number;
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly hasMore: boolean;
}

export const DEFAULT_PAGE: PageRequest = { page: 1, pageSize: 25 };

export function emptyPage<T>(request: PageRequest): Page<T> {
  return {
    items: [],
    total: 0,
    page: request.page,
    pageSize: request.pageSize,
    hasMore: false,
  };
}

/** An inclusive date range, used by every report. */
export interface DateRange {
  readonly from: Date;
  readonly to: Date;
}
