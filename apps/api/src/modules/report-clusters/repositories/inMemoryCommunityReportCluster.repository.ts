import crypto from 'node:crypto';
import type { SafeCommunityReportClusterSummary } from '@safealert/contracts';
import { haversineDistanceMeters } from '../../../shared/geo.js';
import type {
  CommunityReportClusterRepository,
  CreateCommunityReportClusterInput,
  UpdateCommunityReportClusterSummaryInput
} from './communityReportCluster.repository.js';

export class InMemoryCommunityReportClusterRepository implements CommunityReportClusterRepository {
  private readonly clusters = new Map<string, SafeCommunityReportClusterSummary>();

  seedCluster(cluster: SafeCommunityReportClusterSummary) {
    this.clusters.set(cluster.id, structuredClone(cluster));
  }

  async create(input: CreateCommunityReportClusterInput) {
    const now = new Date().toISOString();
    const cluster: SafeCommunityReportClusterSummary = {
      ...input,
      id: crypto.randomBytes(12).toString('hex'),
      firstReportedAt: input.firstReportedAt.toISOString(),
      lastReportedAt: input.lastReportedAt.toISOString(),
      photoEvidenceCount: 0,
      voiceEvidenceCount: 0,
      fieldConfirmationCount: 0,
      createdAt: now,
      updatedAt: now
    };
    this.clusters.set(cluster.id, structuredClone(cluster));
    return structuredClone(cluster);
  }

  async findById(clusterId: string) {
    return structuredClone(this.clusters.get(clusterId) ?? null);
  }

  async findCandidateClusters(query: Parameters<CommunityReportClusterRepository['findCandidateClusters']>[0]) {
    return [...this.clusters.values()]
      .filter((cluster) => cluster.hazardType === query.hazardType)
      .map((cluster) => ({
        cluster,
        distanceMeters: haversineDistanceMeters(query.location, cluster.centerLocation)
      }))
      .filter((candidate) => candidate.distanceMeters <= query.radiusMeters)
      .sort((left, right) => left.distanceMeters - right.distanceMeters)
      .map((candidate) => ({ ...candidate, cluster: structuredClone(candidate.cluster) }));
  }

  async findClustersWithPendingReports() {
    return [...this.clusters.values()]
      .filter((cluster) => cluster.pendingReportCount > 0)
      .sort((left, right) => right.lastReportedAt.localeCompare(left.lastReportedAt))
      .map((cluster) => structuredClone(cluster));
  }

  async findAllClusters() {
    return [...this.clusters.values()]
      .sort((left, right) => right.lastReportedAt.localeCompare(left.lastReportedAt))
      .map((cluster) => structuredClone(cluster));
  }

  async updateSummary(clusterId: string, input: UpdateCommunityReportClusterSummaryInput) {
    const existing = this.clusters.get(clusterId);
    if (!existing) return null;
    const updated: SafeCommunityReportClusterSummary = {
      ...existing,
      ...input,
      firstReportedAt: input.firstReportedAt.toISOString(),
      lastReportedAt: input.lastReportedAt.toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.clusters.set(clusterId, structuredClone(updated));
    return structuredClone(updated);
  }

  async deleteById(clusterId: string) {
    this.clusters.delete(clusterId);
  }
}
