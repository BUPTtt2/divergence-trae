import { query } from './db.js';

export function createArtworkRepository() {
  return {
    async findJob(cardId, userId, idempotencyKey) {
      const result = await query({
        table: 'artwork_jobs', action: 'select',
        filter: { card_id: cardId, user_id: userId, idempotency_key: idempotencyKey },
        queryOptions: { limit: 1 },
      });
      return result.rows[0] || null;
    },
    async findJobById(id, cardId, userId) {
      const result = await query({ table: 'artwork_jobs', action: 'select', filter: { id, card_id: cardId, user_id: userId }, queryOptions: { limit: 1 } });
      return result.rows[0] || null;
    },
    async countReadyVersions(cardId, userId) {
      const result = await query({ table: 'artwork_versions', action: 'select', filter: { card_id: cardId, user_id: userId } });
      return result.rowCount;
    },
    async insertJob(job) {
      const result = await query({ table: 'artwork_jobs', action: 'insert', data: job });
      return result.rows[0];
    },
    async updateJob(id, patch) {
      const result = await query({ table: 'artwork_jobs', action: 'update', id, data: patch });
      return result.rows[0];
    },
    async insertVersion(version) {
      const result = await query({ table: 'artwork_versions', action: 'insert', data: version });
      return result.rows[0];
    },
    async listVersions(cardId, userId) {
      const result = await query({
        table: 'artwork_versions', action: 'select', filter: { card_id: cardId, user_id: userId },
        queryOptions: { orderBy: 'created_at:desc', limit: 50 },
      });
      return result.rows;
    },
    async findVersion(id, cardId, userId) {
      const result = await query({ table: 'artwork_versions', action: 'select', filter: { id, card_id: cardId, user_id: userId }, queryOptions: { limit: 1 } });
      return result.rows[0] || null;
    },
    async selectVersion(id, cardId, userId) {
      const versions = await this.listVersions(cardId, userId);
      for (const version of versions) {
        if (version.selected !== (version.id === id)) {
          await query({ table: 'artwork_versions', action: 'update', id: version.id, data: { selected: version.id === id } });
        }
      }
      return this.findVersion(id, cardId, userId);
    },
    async selectSystem(cardId, userId) {
      const versions = await this.listVersions(cardId, userId);
      for (const version of versions) {
        if (version.selected) await query({ table: 'artwork_versions', action: 'update', id: version.id, data: { selected: false } });
      }
    },
  };
}

export default createArtworkRepository;
