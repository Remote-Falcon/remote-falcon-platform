import { MongoClient } from 'mongodb';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

export default async () => {
  const uri = process.env.MONGO_URI ?? 'mongodb://root:root@localhost:27017/?authSource=admin';
  const dbName = process.env.MONGO_DATABASE ?? 'remote-falcon';

  const client = new MongoClient(uri);
  // Retry connect a few times — dev-up.sh health passed but Mongo may briefly flap
  let lastError: Error | undefined;
  for (let i = 0; i < 5; i++) {
    try {
      await client.connect();
      lastError = undefined;
      break;
    } catch (err) {
      lastError = err as Error;
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  if (lastError) throw lastError;

  try {
    const db = client.db(dbName);
    await db.collection('show').deleteMany({});

    const fixturesDir = join(__dirname, '../fixtures/seed-shows');
    if (existsSync(fixturesDir)) {
      for (const file of readdirSync(fixturesDir).filter(f => f.endsWith('.json'))) {
        const doc = JSON.parse(readFileSync(join(fixturesDir, file), 'utf-8'));
        await db.collection('show').insertOne(doc);
      }
    }
  } finally {
    await client.close();
  }
};
