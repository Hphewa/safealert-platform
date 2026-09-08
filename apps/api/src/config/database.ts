import mongoose from 'mongoose';

export async function connectToDatabase(mongodbUri: string) {
  await mongoose.connect(mongodbUri, {
    serverSelectionTimeoutMS: 5000
  });
}

export async function disconnectFromDatabase() {
  await mongoose.disconnect();
}
