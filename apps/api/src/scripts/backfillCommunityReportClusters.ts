import '../config/loadEnv.js';

import { connectToDatabase, disconnectFromDatabase } from '../config/database.js';
import { loadConfig } from '../config/env.js';
import { MongooseFieldConfirmationRepository } from '../modules/field-confirmations/repositories/mongooseFieldConfirmation.repository.js';
import { MongooseCommunityReportClusterRepository } from '../modules/report-clusters/repositories/mongooseCommunityReportCluster.repository.js';
import { CommunityReportGroupingService } from '../modules/report-clusters/services/communityReportGrouping.service.js';
import { MongooseReportRepository } from '../modules/reports/repositories/mongooseReport.repository.js';

async function main() {
  const apply = process.argv.includes('--apply');
  const config = loadConfig();
  if (!config.mongodbUri) throw new Error('MONGODB_URI is required for community report cluster backfill.');

  await connectToDatabase(config.mongodbUri);

  try {
    const reports = new MongooseReportRepository();
    const service = new CommunityReportGroupingService(
      new MongooseCommunityReportClusterRepository(),
      reports,
      new MongooseFieldConfirmationRepository()
    );
    const candidates = (await reports.findReportsByStatuses(['PENDING']))
      .filter((report) => !report.communityReportClusterId);

    if (!apply) {
      console.log(JSON.stringify({
        mode: 'dry-run',
        unclusteredPendingReports: candidates.length,
        message: 'Run with --apply to assign unclustered pending reports to CommunityReportClusters.'
      }, null, 2));
      return;
    }

    let assigned = 0;
    for (const report of candidates) {
      await service.assignReportToCluster(report);
      assigned += 1;
    }

    console.log(JSON.stringify({ mode: 'apply', assigned }, null, 2));
  } finally {
    await disconnectFromDatabase();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Community report cluster backfill failed.');
  process.exit(1);
});

