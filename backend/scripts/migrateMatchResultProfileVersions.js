import 'dotenv/config';
import mongoose from 'mongoose';
import { MatchResult } from '../models/MatchResult.js';

await mongoose.connect(process.env.MONGODB_URI);
try {
  const indexes = await MatchResult.collection.indexes();
  for (const index of indexes) {
    const keys = Object.keys(index.key || {});
    if (keys.length === 2 && keys[0] === 'profileId' && keys[1] === 'jobId' && index.unique) {
      await MatchResult.collection.dropIndex(index.name);
      console.log(`[profile-version-migration] dropped ${index.name}`);
    }
  }
  await MatchResult.syncIndexes();
  console.log('[profile-version-migration] MatchResult indexes synchronized');
} finally {
  await mongoose.disconnect();
}
