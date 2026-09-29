import mongoose from 'mongoose';

let connectionPromise = null;

export async function connectMongo(uri = process.env.MONGODB_URI) {
  if (!uri) throw new Error('MONGODB_URI is not configured. Set it in the environment before connecting to MongoDB.');
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (!connectionPromise) {
    connectionPromise = mongoose.connect(uri, {
      dbName: process.env.MONGODB_DB_NAME || 'jobmatchportal',
      serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 5000),
      maxPoolSize: Number(process.env.MONGODB_MAX_POOL_SIZE || 10)
    }).then(() => mongoose.connection).catch(error => {
      connectionPromise = null;
      throw error;
    });
  }
  return connectionPromise;
}

export async function disconnectMongo() {
  connectionPromise = null;
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
}

export function mongoHealth() {
  const states = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
  return { state: states[mongoose.connection.readyState] || 'unknown', readyState: mongoose.connection.readyState, database: mongoose.connection.name || null };
}
