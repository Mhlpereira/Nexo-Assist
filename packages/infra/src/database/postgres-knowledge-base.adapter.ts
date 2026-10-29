import type { Article, KnowledgeBase } from '@nexo/core'
import type { Sql } from './connection'

const searchTerms = (query: string): string[] =>
  query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 1)
    .slice(0, 12)

export function createPostgresKnowledgeBase(sql: Sql): KnowledgeBase {
  return {
    async search(query, limit) {
      const terms = searchTerms(query)
      if (terms.length === 0) return []
      return sql<Article[]>`
        select slug, title, body, applies_to
        from knowledge_articles, to_tsquery('portuguese', ${terms.join(' | ')}) as query
        where search @@ query
        order by ts_rank(search, query) desc
        limit ${limit}`
    },
  }
}
