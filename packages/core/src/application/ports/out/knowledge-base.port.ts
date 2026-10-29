import type { Article } from '../../dto/article.dto'

export interface KnowledgeBase {
  search(query: string, limit: number): Promise<Article[]>
}
