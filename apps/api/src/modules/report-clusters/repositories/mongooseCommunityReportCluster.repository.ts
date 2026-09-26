import {
  CommunityReportClusterModel,
  toSafeCommunityReportCluster
} from '../models/communityReportCluster.model.js';
import type {
  CommunityReportClusterRepository,
  CreateCommunityReportClusterInput,
  UpdateCommunityReportClusterSummaryInput
} from './communityReportCluster.repository.js';

export class MongooseCommunityReportClusterRepository implements CommunityReportClusterRepository {
  async create(input: CreateCommunityReportClusterInput) {
    return toSafeCommunityReportCluster(await CommunityReportClusterModel.create(input));
  }

  async findById(clusterId: string) {
    const cluster = await CommunityReportClusterModel.findById(clusterId).exec();
    return cluster ? toSafeCommunityReportCluster(cluster) : null;
  }

  async findCandidateClusters(query: Parameters<CommunityReportClusterRepository['findCandidateClusters']>[0]) {
    const clusters = await CommunityReportClusterModel.aggregate<{ distanceMeters: number }>([
      {
        $geoNear: {
          near: query.location,
          distanceField: 'distanceMeters',
          maxDistance: query.radiusMeters,
          spherical: true,
          query: { hazardType: query.hazardType }
        }
      }
    ]).exec();

    return clusters
      .map((raw) => ({
        cluster: toSafeCommunityReportCluster(CommunityReportClusterModel.hydrate(raw)),
        distanceMeters: raw.distanceMeters
      }))
      .sort((left, right) => left.distanceMeters - right.distanceMeters);
  }

  async findClustersWithPendingReports() {
    const clusters = await CommunityReportClusterModel.find({ pendingReportCount: { $gt: 0 } })
      .sort({ lastReportedAt: -1 })
      .exec();
    return clusters.map(toSafeCommunityReportCluster);
  }

  async updateSummary(clusterId: string, input: UpdateCommunityReportClusterSummaryInput) {
    const cluster = await CommunityReportClusterModel.findByIdAndUpdate(
      clusterId,
      { $set: input },
      { new: true, runValidators: true }
    ).exec();
    return cluster ? toSafeCommunityReportCluster(cluster) : null;
  }

  async deleteById(clusterId: string) {
    await CommunityReportClusterModel.findByIdAndDelete(clusterId).exec();
  }
}

